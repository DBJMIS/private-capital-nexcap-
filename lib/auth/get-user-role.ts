/**
 * Resolve active platform role from `vc_user_roles` for a profile matched by email.
 *
 * File path: lib/auth/get-user-role.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { USER_ROLE_CACHE_HEADER } from '@/lib/auth/rbac';

const NONE = '__none__';

export async function getUserRole(
  supabase: SupabaseClient,
  email: string,
  tenantId: string,
  requestHeaders?: Headers,
): Promise<string | null> {
  const cached = requestHeaders?.get(USER_ROLE_CACHE_HEADER);
  if (cached === NONE) return null;
  if (cached && cached.length > 0) return cached;

  const normalizedEmail = email.trim().toLowerCase();

  const { data: profile, error: pErr } = await supabase
    .from('vc_profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (pErr || !profile?.id) {
    return null;
  }

  const { data: row, error: rErr } = await supabase
    .from('vc_user_roles')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('profile_id', profile.id)
    .eq('is_active', true)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rErr || !row?.role) {
    return null;
  }

  return String(row.role);
}

export function cacheUserRoleOnHeaders(headers: Headers, role: string | null) {
  headers.set(USER_ROLE_CACHE_HEADER, role && role.length > 0 ? role : NONE);
}

export { NONE as USER_ROLE_NONE_MARKER };
