import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { ALL_MODULE_IDS } from '@/lib/auth/module-access';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ROLES = [
  'admin',
  'pctu_officer',
  'portfolio_manager',
  'investment_officer',
  'panel_member',
  'it_admin',
  'senior_management',
] as const;

export async function GET() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const { data: roleRows } = await supabase
    .from('vc_user_roles')
    .select('role, is_active')
    .eq('tenant_id', profile.tenant_id);
  const { data: permRows } = await supabase
    .from('vc_role_permissions')
    .select('role, module_id, access_level')
    .eq('tenant_id', profile.tenant_id)
    .neq('access_level', 'none');

  const roleCounts = new Map<string, number>();
  for (const r of roleRows ?? []) {
    const row = r as { role?: string | null; is_active?: boolean | null };
    if (!row.role || !row.is_active) continue;
    roleCounts.set(row.role, (roleCounts.get(row.role) ?? 0) + 1);
  }

  const moduleCounts = new Map<string, number>();
  for (const p of permRows ?? []) {
    const row = p as { role?: string | null; module_id?: string | null };
    if (!row.role || !row.module_id || !ALL_MODULE_IDS.includes(row.module_id)) continue;
    moduleCounts.set(row.role, (moduleCounts.get(row.role) ?? 0) + 1);
  }

  return NextResponse.json(
    ROLES.map((role) => ({
      role,
      user_count: roleCounts.get(role) ?? 0,
      module_count: role === 'admin' ? ALL_MODULE_IDS.length : moduleCounts.get(role) ?? 0,
    })),
  );
}

