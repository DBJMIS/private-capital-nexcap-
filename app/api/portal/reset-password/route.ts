import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAndReturn } from '@/lib/api/errors';
import { parsePortalInviteMetadata } from '@/lib/portal/invitation-metadata';
import { assertPasswordStrength } from '@/lib/portal/password';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid request body' }, { status: 400 });
    }

    const { token, password } = parsed.data;
    const strength = assertPasswordStrength(password);
    if (!strength.ok) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: strength.message }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: invRaw, error: invErr } = await supabase
      .from('vc_invitations')
      .select('id, role, status, token_expires_at, metadata')
      .eq('token', token.trim())
      .maybeSingle();

    if (invErr || !invRaw) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Invalid or expired link.' }, { status: 404 });
    }

    const inv = invRaw as {
      id: string;
      role: string;
      status: string;
      token_expires_at: string;
      metadata: Record<string, unknown>;
    };

    if (inv.role !== 'password_reset' || inv.status !== 'pending') {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'This link is no longer valid.' }, { status: 403 });
    }

    const exp = new Date(inv.token_expires_at).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'This link has expired.' }, { status: 410 });
    }

    const meta = parsePortalInviteMetadata(inv.metadata);
    const profileId = meta.profile_id;
    if (!profileId) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Invalid reset request.' }, { status: 404 });
    }

    const hash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    const { error: updErr } = await supabase
      .from('vc_profiles')
      .update({
        password_hash: hash,
        updated_at: now,
      })
      .eq('id', profileId)
      .eq('is_portal_user', true);

    if (updErr) {
      return logAndReturn(updErr, 'portal/reset-password:profile', 'INTERNAL_ERROR', 'Could not update password.', 500);
    }

    // Do not set status='accepted' here: vc_invitations has UNIQUE (tenant_id, email, status) and
    // the fund_manager portal invite is already accepted for this email — UPDATE would violate 23505.
    // Delete this single-use password_reset row to invalidate the token.
    const { error: delErr } = await supabase.from('vc_invitations').delete().eq('id', inv.id);

    if (delErr) {
      return logAndReturn(delErr, 'portal/reset-password:invite', 'INTERNAL_ERROR', 'Password updated but token could not be cleared.', 500);
    }

    return NextResponse.json({ success: true as const });
  } catch (e) {
    return logAndReturn(e, 'portal/reset-password', 'INTERNAL_ERROR', 'Could not reset password.', 500);
  }
}
