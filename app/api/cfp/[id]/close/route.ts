import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { canMutateCfp } from '@/lib/cfp/access';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteCtx) {
  const { id: cfpId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !canMutateCfp(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: row, error } = await supabase
    .from('vc_cfps')
    .select('id, status')
    .eq('id', cfpId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'CFP not found' }, { status: 404 });
  }

  if ((row as { status: string }).status !== 'active') {
    return NextResponse.json({ error: 'Only active CFPs can be closed' }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_cfps')
    .update({ status: 'closed' })
    .eq('id', cfpId)
    .eq('tenant_id', profile.tenant_id)
    .select('id, status')
    .maybeSingle();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Close failed' }, { status: 500 });
  }

  return NextResponse.json(updated);
}
