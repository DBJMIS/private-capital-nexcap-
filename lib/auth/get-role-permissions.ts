import type { SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';

import { MODULE_ROUTE_MAP } from '@/lib/auth/module-access';
import { createServerClient } from '@/lib/supabase/server';

function mapPermissionRows(data: unknown[] | null): string[] {
  return (data ?? [])
    .map((p) => {
      const row = p as { module_id?: string | null };
      if (!row.module_id) return null;
      return MODULE_ROUTE_MAP[row.module_id] ?? null;
    })
    .filter((p): p is string => !!p);
}

/** RBAC lookup using an existing Supabase client (e.g. service role in `proxy.ts`). Not cached — Edge-safe. */
export async function getRolePermissions(
  supabase: SupabaseClient,
  role: string,
  tenantId: string,
): Promise<string[]> {
  if (role === 'admin') return ['*'];

  const { data } = await supabase
    .from('vc_role_permissions')
    .select('module_id, access_level')
    .eq('tenant_id', tenantId)
    .eq('role', role)
    .neq('access_level', 'none');

  return mapPermissionRows(data as unknown[] | null);
}

const getCachedRolePermissionsInner = unstable_cache(
  async (tenantId: string, role: string) => {
    if (role === 'admin') return ['*'] as string[];
    const supabase = createServerClient();
    const { data } = await supabase
      .from('vc_role_permissions')
      .select('module_id, access_level')
      .eq('tenant_id', tenantId)
      .eq('role', role)
      .neq('access_level', 'none');
    return mapPermissionRows(data as unknown[] | null);
  },
  ['role-permissions'],
  { revalidate: 600, tags: ['role-permissions'] },
);

/** Server-only: cached role → route list for UI that does not run on the Edge middleware path. */
export async function getCachedRolePermissions(tenantId: string, role: string): Promise<string[]> {
  return getCachedRolePermissionsInner(tenantId, role);
}
