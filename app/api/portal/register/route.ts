import { randomBytes } from 'crypto';

import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { parsePortalInviteMetadata } from '@/lib/portal/invitation-metadata';
import { assertPasswordStrength } from '@/lib/portal/password';
import { logAndReturn } from '@/lib/api/errors';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function isMissingProfileIdColumnError(err: { message?: string } | null | undefined): boolean {
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes("could not find the 'profile_id' column") || msg.includes('column vc_user_roles.profile_id does not exist');
}

function isUserIdForeignKeyError(err: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '23503') {
    const txt = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
    return txt.includes('vc_user_roles_user_id_fkey');
  }
  const txt = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
  return txt.includes('vc_user_roles_user_id_fkey');
}

type InviteRow = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  token_expires_at: string;
  status: string;
  metadata: Record<string, unknown>;
};

async function fetchInviteByToken(supabase: ReturnType<typeof createServiceRoleClient>, token: string) {
  const { data: inv, error } = await supabase
    .from('vc_invitations')
    .select('id, tenant_id, email, full_name, role, token_expires_at, status, metadata')
    .eq('token', token)
    .maybeSingle();

  if (error || !inv) {
    return { inv: null as InviteRow | null, error };
  }
  return { inv: inv as InviteRow, error: null };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token')?.trim() ?? '';
    if (!token) {
      return NextResponse.json({ valid: false as const, reason: 'missing_token' });
    }

    const supabase = createServiceRoleClient();
    const { inv, error } = await fetchInviteByToken(supabase, token);
    if (error || !inv) {
      return NextResponse.json({ valid: false as const, reason: 'invalid_token' });
    }

    if (inv.role !== 'fund_manager') {
      return NextResponse.json({ valid: false as const, reason: 'invalid_role' });
    }

    if (inv.status === 'accepted') {
      return NextResponse.json({
        valid: false as const,
        reason: 'already_registered' as const,
        message: 'This invitation has already been used. Please sign in instead.',
      });
    }

    if (inv.status !== 'pending') {
      return NextResponse.json({ valid: false as const, reason: 'not_pending' });
    }

    const exp = new Date(inv.token_expires_at).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) {
      return NextResponse.json({ valid: false as const, reason: 'expired' });
    }

    const meta = parsePortalInviteMetadata(inv.metadata);
    return NextResponse.json({
      valid: true as const,
      email: inv.email.trim(),
      full_name: inv.full_name.trim(),
      fund_name: meta.fund_name ?? null,
    });
  } catch (e) {
    return logAndReturn(e, 'portal/register:GET', 'INTERNAL_ERROR', 'Unable to validate invitation.', 500);
  }
}

const PostBody = z.object({
  token: z.string().min(1),
  full_name: z.string().min(1).max(200),
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

    const parsed = PostBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid request body' }, { status: 400 });
    }

    const { token, full_name, password } = parsed.data;
    const strength = assertPasswordStrength(password);
    if (!strength.ok) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: strength.message }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { inv, error } = await fetchInviteByToken(supabase, token.trim());
    if (error || !inv) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Invalid invitation.' }, { status: 404 });
    }

    if (inv.status !== 'pending' || inv.role !== 'fund_manager') {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Invitation is not usable.' }, { status: 403 });
    }

    const exp = new Date(inv.token_expires_at).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Invitation has expired.' }, { status: 410 });
    }

    const inviteEmail = inv.email.trim().toLowerCase();
    const meta = parsePortalInviteMetadata(inv.metadata);

    const { data: existingProfile } = await supabase
      .from('vc_profiles')
      .select('id')
      .eq('tenant_id', inv.tenant_id)
      .ilike('email', inviteEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'An account already exists for this email.' },
        { status: 409 },
      );
    }

    const hash = await bcrypt.hash(password, 12);
    const internalPassword = randomBytes(32).toString('base64url');

    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: inviteEmail,
      password: internalPassword,
      email_confirm: true,
    });

    if (authErr || !authUser?.user?.id) {
      return logAndReturn(authErr ?? new Error('no user id'), 'portal/register:createUser', 'UPSTREAM_ERROR', 'Could not create account.', 502);
    }

    const userId = authUser.user.id;
    const now = new Date().toISOString();

    const { data: insertedProfile, error: profileErr } = await supabase
      .from('vc_profiles')
      .insert({
        tenant_id: inv.tenant_id,
        user_id: userId,
        full_name: full_name.trim(),
        email: inviteEmail,
        role: 'fund_manager',
        is_active: true,
        is_portal_user: true,
        password_hash: hash,
      })
      .select('id')
      .single();

    if (profileErr || !insertedProfile?.id) {
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
      return logAndReturn(profileErr ?? new Error('profile'), 'portal/register:profile', 'INTERNAL_ERROR', 'Could not complete registration.', 500);
    }

    const profileId = insertedProfile.id as string;

    const roleInsertBase = {
      tenant_id: inv.tenant_id,
      role: 'fund_manager' as const,
      assigned_at: now,
      assigned_by: null as string | null,
      is_active: true,
      deactivated_at: null as string | null,
      deactivated_by: null as string | null,
    };

    const insertByProfile = await supabase.from('vc_user_roles').insert({
      ...roleInsertBase,
      profile_id: profileId,
    });

    let roleErr = insertByProfile.error;
    if (roleErr && isMissingProfileIdColumnError(roleErr)) {
      const firstByAuth = await supabase.from('vc_user_roles').insert({
        ...roleInsertBase,
        user_id: userId,
      });
      if (firstByAuth.error && isUserIdForeignKeyError(firstByAuth.error)) {
        const byProfileUuid = await supabase.from('vc_user_roles').insert({
          ...roleInsertBase,
          user_id: profileId,
        });
        roleErr = byProfileUuid.error;
      } else {
        roleErr = firstByAuth.error;
      }
    }

    if (roleErr) {
      await supabase.from('vc_profiles').delete().eq('id', profileId);
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
      return logAndReturn(roleErr, 'portal/register:user_roles', 'INTERNAL_ERROR', 'Could not complete registration.', 500);
    }

    const applicationId = meta.application_id;
    const fundManagerId = meta.fund_manager_id;
    const contactId = meta.contact_id;

    if (contactId) {
      const { error: contactError } = await supabase
        .from('fund_manager_contacts')
        .update({
          portal_user_id: userId,
          portal_access: true,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .eq('tenant_id', inv.tenant_id);

      if (contactError) {
        console.error('[portal/register:contact_link]', contactError);
      }
    }

    if (!applicationId) {
      console.warn(
        '[portal/register] invitation missing application_id in metadata; user may see no_application until DBJ links the application.',
      );
    } else {
      const applicationUpdate: { created_by: string; fund_manager_id?: string } = { created_by: userId };
      if (fundManagerId) applicationUpdate.fund_manager_id = fundManagerId;
      const { error: appLinkErr } = await supabase
        .from('vc_fund_applications')
        .update(applicationUpdate)
        .eq('id', applicationId)
        .eq('tenant_id', inv.tenant_id);

      if (appLinkErr) {
        return logAndReturn(
          appLinkErr,
          'portal/register:link_application',
          'INTERNAL_ERROR',
          'Account created but could not be linked to your fund application. Please contact DBJ at info@dbankjm.com.',
          500,
        );
      }

      const { data: verifyApp, error: verifyErr } = await supabase
        .from('vc_fund_applications')
        .select('id, created_by, fund_manager_id')
        .eq('id', applicationId)
        .eq('tenant_id', inv.tenant_id)
        .single();

      if (verifyErr) {
        return logAndReturn(
          verifyErr,
          'portal/register:verify_link',
          'INTERNAL_ERROR',
          'Account created but fund application link could not be verified. Please contact DBJ at info@dbankjm.com.',
          500,
        );
      }

      const row = verifyApp as { created_by: string; fund_manager_id: string | null };
      const linkedByCreator = row.created_by === userId;
      const linkedByFundManager =
        typeof fundManagerId === 'string' &&
        row.fund_manager_id != null &&
        row.fund_manager_id === fundManagerId;

      if (!linkedByCreator && !linkedByFundManager) {
        return logAndReturn(
          new Error('application link verification failed'),
          'portal/register:verify_link',
          'INTERNAL_ERROR',
          'Account created but fund application link could not be verified. Please contact DBJ at info@dbankjm.com.',
          500,
        );
      }
    }

    if (fundManagerId) {
      const { error: fmUpdErr } = await supabase
        .from('fund_managers')
        .update({ email: inviteEmail })
        .eq('id', fundManagerId)
        .eq('tenant_id', inv.tenant_id);

      if (fmUpdErr) {
        console.error('[portal/register:fund_manager_email]', fmUpdErr);
      }
    }

    const { error: invErr } = await supabase
      .from('vc_invitations')
      .update({
        status: 'accepted',
        accepted_at: now,
      })
      .eq('id', inv.id);

    if (invErr) {
      return logAndReturn(invErr, 'portal/register:invite', 'INTERNAL_ERROR', 'Account created but invitation update failed.', 500);
    }

    return NextResponse.json({ success: true as const });
  } catch (e) {
    return logAndReturn(e, 'portal/register:POST', 'INTERNAL_ERROR', 'Registration failed.', 500);
  }
}
