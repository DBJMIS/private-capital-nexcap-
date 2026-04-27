import type { SupabaseClient } from '@supabase/supabase-js';

import { MODULE_ROUTE_MAP } from '@/lib/auth/module-access';

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

  return (data ?? [])
    .map((p) => {
      const row = p as { module_id?: string | null };
      if (!row.module_id) return null;
      return MODULE_ROUTE_MAP[row.module_id] ?? null;
    })
    .filter((p): p is string => !!p);
}

