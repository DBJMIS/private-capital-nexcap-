import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers, isAdminRole } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, ctx: Ctx) {
  await requireAuth();
  const caller = await getProfile();
  if (!caller || !canManageUsers(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: profileId } = await ctx.params;
  if (!profileId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createServerClient();
  const { data: target } = await supabase
    .from('vc_profiles')
    .select('id, role')
    .eq('tenant_id', caller.tenant_id)
    .eq('id', profileId)
    .maybeSingle();

  if (!target?.id) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (isAdminRole(target.role as string)) {
    return NextResponse.json({ error: 'Cannot modify admin users' }, { status: 403 });
  }

  const now = new Date().toISOString();

  const { data: ur, error: roleErr } = await supabase
    .from('vc_user_roles')
    .update({
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
      assigned_at: now,
      assigned_by: caller.profile_id,
    })
    .eq('tenant_id', caller.tenant_id)
    .eq('profile_id', profileId)
    .select('*')
    .maybeSingle();

  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

  const { error: profileErr } = await supabase
    .from('vc_profiles')
    .update({ is_active: true, updated_at: now })
    .eq('tenant_id', caller.tenant_id)
    .eq('id', profileId);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  return NextResponse.json({ reactivated: true, record: ur ?? null });
}
