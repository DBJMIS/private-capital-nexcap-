import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { VCRole } from '@/types/auth';

import { landingPathForInviteRole } from '@/lib/invitations/invite-landing';

const INVITE_ROLES: VCRole[] = [
  'pctu_officer',
  'investment_officer',
  'portfolio_manager',
  'panel_member',
  'it_admin',
  'senior_management',
];

export async function acceptInvitationForSession(
  supabase: SupabaseClient,
  params: {
    token: string;
    email: string;
    fullNameFromSession: string;
    azureUserId: string;
  },
): Promise<{ ok: true; redirect: string } | { ok: false; code: 'invalid' | 'expired' | 'revoked' | 'email_mismatch' | 'bad_role' }> {
  const token = params.token.trim();
  if (!token) return { ok: false, code: 'invalid' };

  const { data: inv, error } = await supabase
    .from('vc_invitations')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !inv) return { ok: false, code: 'invalid' };

  const row = inv as {
    id: string;
    tenant_id: string;
    email: string;
    full_name: string;
    role: string;
    token_expires_at: string;
    status: string;
  };

  if (row.status === 'accepted') {
    return { ok: true, redirect: landingPathForInviteRole(row.role) };
  }
  if (row.status === 'revoked') return { ok: false, code: 'revoked' };
  if (row.status !== 'pending') return { ok: false, code: 'invalid' };

  const exp = new Date(row.token_expires_at).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    return { ok: false, code: 'expired' };
  }

  const inviteEmail = row.email.trim().toLowerCase();
  const sessionEmail = params.email.trim().toLowerCase();
  if (inviteEmail !== sessionEmail) {
    return { ok: false, code: 'email_mismatch' };
  }

  if (!INVITE_ROLES.includes(row.role as VCRole)) {
    return { ok: false, code: 'bad_role' };
  }

  const { data: existingProfile } = await supabase
    .from('vc_profiles')
    .select('id')
    .eq('tenant_id', row.tenant_id)
    .ilike('email', sessionEmail)
    .maybeSingle();

  const fullName = row.full_name?.trim() || params.fullNameFromSession;
  let profileId: string;

  if (existingProfile?.id) {
    profileId = existingProfile.id;
    await supabase
      .from('vc_profiles')
      .update({
        full_name: fullName,
        is_active: true,
        role: row.role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('vc_profiles')
      .insert({
        tenant_id: row.tenant_id,
        user_id: params.azureUserId,
        full_name: fullName,
        email: sessionEmail,
        role: row.role,
        is_active: true,
      })
      .select('id')
      .single();
    if (insErr || !inserted?.id) {
      console.error('[acceptInvitation] profile insert', insErr);
      return { ok: false, code: 'invalid' };
    }
    profileId = inserted.id;
  }

  const now = new Date().toISOString();

  const { data: existingUr } = await supabase
    .from('vc_user_roles')
    .select('id')
    .eq('tenant_id', row.tenant_id)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (existingUr?.id) {
    await supabase
      .from('vc_user_roles')
      .update({
        role: row.role,
        is_active: true,
        assigned_at: now,
        assigned_by: null,
        deactivated_at: null,
        deactivated_by: null,
      })
      .eq('id', existingUr.id);
  } else {
    await supabase.from('vc_user_roles').insert({
      tenant_id: row.tenant_id,
      profile_id: profileId,
      role: row.role,
      assigned_at: now,
      assigned_by: null,
      is_active: true,
    });
  }

  await supabase
    .from('vc_invitations')
    .update({
      status: 'accepted',
      accepted_at: now,
    })
    .eq('id', row.id);

  return { ok: true, redirect: landingPathForInviteRole(row.role) };
}
