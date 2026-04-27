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
    .select('id, status, title, opening_date, closing_date')
    .eq('id', cfpId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'CFP not found' }, { status: 404 });
  }

  const r = row as { status: string; title: string; opening_date: string; closing_date: string };
  if (r.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft CFPs can be activated' }, { status: 400 });
  }

  const title = r.title?.trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required before activation' }, { status: 400 });
  }
  if (!r.opening_date || !r.closing_date) {
    return NextResponse.json({ error: 'Opening and closing dates are required before activation' }, { status: 400 });
  }
  if (r.closing_date <= r.opening_date) {
    return NextResponse.json({ error: 'closing_date must be after opening_date' }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_cfps')
    .update({ status: 'active' })
    .eq('id', cfpId)
    .eq('tenant_id', profile.tenant_id)
    .select('id, status')
    .maybeSingle();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Activation failed' }, { status: 500 });
  }

  return NextResponse.json(updated);
}
