import { randomBytes } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { ASSIGNABLE_INVITE_ROLES_TUPLE, canManageUsers, roleDisplayLabel } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { invitationAcceptUrl, sendInvitationEmail } from '@/lib/email/send-invitation-email';

export const dynamic = 'force-dynamic';

const Body = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.enum(ASSIGNABLE_INVITE_ROLES_TUPLE),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !canManageUsers(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { full_name, email, role, note } = parsed.data;
    const emailNorm = email.trim().toLowerCase();
    const supabase = createServerClient();

    const { data: existingUser } = await supabase
      .from('vc_profiles')
      .select('id, is_active')
      .eq('tenant_id', profile.tenant_id)
      .ilike('email', emailNorm)
      .maybeSingle();

    if (existingUser?.id && existingUser.is_active) {
      const { data: activeRole } = await supabase
        .from('vc_user_roles')
        .select('id')
        .eq('tenant_id', profile.tenant_id)
        .eq('profile_id', existingUser.id)
        .eq('is_active', true)
        .maybeSingle();
      if (activeRole) {
        return NextResponse.json({ error: 'An active user already exists with this email.' }, { status: 409 });
      }
    }

    const { data: pendingInvite } = await supabase
      .from('vc_invitations')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .ilike('email', emailNorm)
      .eq('status', 'pending')
      .maybeSingle();

    if (pendingInvite) {
      return NextResponse.json({ error: 'A pending invitation already exists for this email.' }, { status: 409 });
    }

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error } = await supabase
      .from('vc_invitations')
      .insert({
        tenant_id: profile.tenant_id,
        email: emailNorm,
        full_name: full_name.trim(),
        role,
        token,
        token_expires_at: expires,
        status: 'pending',
        invited_by: profile.profile_id,
        personal_note: note?.trim() || null,
      })
      .select('id, email, token_expires_at')
      .single();

    if (error || !inserted) {
      console.error('[invite:insert]', error);
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
    }

    const send = await sendInvitationEmail({
      to: emailNorm,
      inviteeName: full_name.trim(),
      inviterName: profile.full_name,
      roleLabel: roleDisplayLabel(role),
      acceptUrl: invitationAcceptUrl(token),
      note: note ?? null,
    });

    if ('error' in send) {
      if (send.error === 'RESEND_API_KEY not configured') {
        return NextResponse.json({
          invitation_id: inserted.id,
          email: inserted.email,
          expires_at: inserted.token_expires_at,
          warning: send.error,
        });
      }
      console.error('[invite:email]', send.error);
      return NextResponse.json({ error: 'Failed to send invitation email' }, { status: 502 });
    }

    return NextResponse.json({
      invitation_id: inserted.id,
      email: inserted.email,
      expires_at: inserted.token_expires_at,
    });
  } catch (error) {
    console.error('[invite:post]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
