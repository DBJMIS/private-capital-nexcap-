import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ role: string }> };

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

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('vc_user_roles')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('role', role)
    .eq('is_active', true)
    .order('assigned_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profileIds = new Set<string>();
  const userIds = new Set<string>();
  for (const r of rows ?? []) {
    const row = r as { profile_id?: string | null; user_id?: string | null };
    if (row.profile_id) profileIds.add(row.profile_id);
    if (row.user_id) userIds.add(row.user_id);
  }

  let byProfileId = new Map<string, { id: string; full_name: string; email: string }>();
  let byUserId = new Map<string, { id: string; full_name: string; email: string }>();
  if (profileIds.size > 0 || userIds.size > 0) {
    let query = supabase.from('vc_profiles').select('id, user_id, full_name, email').eq('tenant_id', profile.tenant_id);
    if (profileIds.size > 0) {
      query = query.in('id', [...profileIds]);
    } else {
      query = query.in('user_id', [...userIds]);
    }
    const { data: profiles } = await query;
    for (const p of profiles ?? []) {
      const row = p as { id: string; user_id: string; full_name: string; email: string };
      byProfileId.set(row.id, row);
      byUserId.set(row.user_id, row);
    }
  }

  const users = (rows ?? [])
    .map((r) => {
      const row = r as { id: string; profile_id?: string | null; user_id?: string | null; assigned_at: string };
      const p = row.profile_id ? byProfileId.get(row.profile_id) : row.user_id ? byUserId.get(row.user_id) : null;
      if (!p) return null;
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        assigned_at: row.assigned_at,
      };
    })
    .filter((u): u is { id: string; full_name: string; email: string; assigned_at: string } => !!u);

  return NextResponse.json({ users });
}

