import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { ASSIGNABLE_INVITE_ROLES, canManageUsers, isAdminRole } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ROLE_SET = new Set<string>([
  ...ASSIGNABLE_INVITE_ROLES,
  'viewer',
  'analyst',
  'officer',
]);

const Body = z.object({
  role: z.string().refine((r) => ROLE_SET.has(r), 'Invalid role'),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: profileId } = await ctx.params;
  if (!profileId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const newRole = parsed.data.role;
  if (isAdminRole(newRole)) {
    return NextResponse.json({ error: 'Cannot assign admin role via API' }, { status: 400 });
  }

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
    return NextResponse.json({ error: 'Cannot modify admin users' }, { status: 403 });
  }

  const now = new Date().toISOString();

  const { data: ur, error: findErr } = await supabase
    .from('vc_user_roles')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  if (!ur?.id) {
    const { data: inserted, error: insErr } = await supabase
      .from('vc_user_roles')
      .insert({
        tenant_id: profile.tenant_id,
        profile_id: profileId,
        role: newRole,
        assigned_at: now,
        assigned_by: profile.profile_id,
        is_active: true,
      })
      .select('*')
      .single();
    if (insErr || !inserted) {
      return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 });
    }
    await supabase.from('vc_profiles').update({ role: newRole, updated_at: now }).eq('id', profileId);
    return NextResponse.json({ record: inserted });
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_user_roles')
    .update({
      role: newRole,
      assigned_at: now,
      assigned_by: profile.profile_id,
    })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', ur.id)
    .select('*')
    .single();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });
  }

  await supabase.from('vc_profiles').update({ role: newRole, updated_at: now }).eq('id', profileId);

  return NextResponse.json({ record: updated });
}
