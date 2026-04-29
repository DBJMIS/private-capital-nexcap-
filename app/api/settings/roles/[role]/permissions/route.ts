import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { ALL_MODULE_IDS, type AccessLevel } from '@/lib/auth/module-access';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ACCESS_LEVELS: AccessLevel[] = ['full', 'read_only', 'none'];
const Body = z.object({
  permissions: z.record(z.string(), z.enum(['full', 'read_only', 'none'])),
});

function roleAllowed(role: string) {
  return [
    'admin',
    'pctu_officer',
    'portfolio_manager',
    'investment_officer',
    'panel_member',
    'it_admin',
    'senior_management',
  ].includes(role);
}

type Ctx = { params: Promise<{ role: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { role } = await ctx.params;
  if (!roleAllowed(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const permissions: Record<string, AccessLevel> = Object.fromEntries(ALL_MODULE_IDS.map((id) => [id, 'none' as const]));
  if (role === 'admin') {
    for (const id of ALL_MODULE_IDS) permissions[id] = 'full';
    return NextResponse.json({ permissions, role });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('vc_role_permissions')
    .select('module_id, access_level')
    .eq('tenant_id', profile.tenant_id)
    .eq('role', role);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const row of data ?? []) {
    const moduleId = String((row as { module_id?: string | null }).module_id ?? '');
    const access = String((row as { access_level?: string | null }).access_level ?? 'none');
    if (ALL_MODULE_IDS.includes(moduleId) && ACCESS_LEVELS.includes(access as AccessLevel)) {
      permissions[moduleId] = access as AccessLevel;
    }
  }

  return NextResponse.json({ permissions, role });
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { role } = await ctx.params;
    if (!roleAllowed(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (role === 'admin') {
      return NextResponse.json({ error: 'Admin permissions are read-only' }, { status: 403 });
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const perms = parsed.data.permissions;
    const rows = Object.entries(perms)
      .filter(([moduleId]) => ALL_MODULE_IDS.includes(moduleId))
      .map(([module_id, access_level]) => ({
        tenant_id: profile.tenant_id,
        role,
        module_id,
        access_level,
        updated_at: new Date().toISOString(),
      }));

    const supabase = createServerClient();
    const { error } = await supabase
      .from('vc_role_permissions')
      .upsert(rows, { onConflict: 'tenant_id,role,module_id', ignoreDuplicates: false });

    if (error) {
      console.error('[settings-role-permissions:put]', error);
      return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: rows.length });
  } catch (error) {
    console.error('[settings-role-permissions:put]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

