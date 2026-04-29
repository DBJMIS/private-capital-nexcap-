import { randomBytes } from 'crypto';

import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers, roleDisplayLabel } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { invitationAcceptUrl, sendInvitationEmail } from '@/lib/email/send-invitation-email';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const supabase = createServerClient();

  const { data: inv, error } = await supabase
    .from('vc_invitations')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (error || !inv) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

  const row = inv as {
    id: string;
    email: string;
    full_name: string;
    role: string;
    status: string;
    personal_note: string | null;
  };

  if (row.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending invitations can be resent' }, { status: 400 });
  }

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: upErr } = await supabase
    .from('vc_invitations')
    .update({ token, token_expires_at: expires })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', row.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const send = await sendInvitationEmail({
    to: row.email,
    inviteeName: row.full_name,
    inviterName: profile.full_name,
    roleLabel: roleDisplayLabel(row.role),
    acceptUrl: invitationAcceptUrl(token),
    note: row.personal_note,
  });

  if ('error' in send && send.error !== 'RESEND_API_KEY not configured') {
    return NextResponse.json({ error: send.error }, { status: 502 });
  }

  return NextResponse.json({ resent: true, expires_at: expires });
}
