import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers, isAdminRole } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: profileId } = await ctx.params;
  if (!profileId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createServerClient();

  const { data: targetProfile } = await supabase
    .from('vc_profiles')
    .select('id, role')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', profileId)
    .maybeSingle();

  if (!targetProfile?.id) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (isAdminRole(targetProfile.role as string)) {
    return NextResponse.json({ error: 'Cannot deactivate admin users' }, { status: 403 });
  }

  const now = new Date().toISOString();

  const { data: ur } = await supabase
    .from('vc_user_roles')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (ur?.id) {
    const { error } = await supabase
      .from('vc_user_roles')
      .update({
        is_active: false,
        deactivated_at: now,
        deactivated_by: profile.profile_id,
      })
      .eq('id', ur.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: pErr } = await supabase
    .from('vc_profiles')
    .update({ is_active: false, updated_at: now })
    .eq('id', profileId)
    .eq('tenant_id', profile.tenant_id);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  return NextResponse.json({ deactivated: true });
}
