import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const supabase = createServerClient();

  const { data: inv, error } = await supabase
    .from('vc_invitations')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (error || !inv) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

  if (inv.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending invitations can be revoked' }, { status: 400 });
  }

  const { error: upErr } = await supabase.from('vc_invitations').update({ status: 'revoked' }).eq('id', id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ revoked: true });
}
