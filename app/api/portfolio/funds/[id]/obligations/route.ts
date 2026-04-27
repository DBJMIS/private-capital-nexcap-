import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId } = await ctx.params;
  const url = new URL(req.url);
  const year = url.searchParams.get('year');
  const reportType = url.searchParams.get('report_type');
  const status = url.searchParams.get('status');

  const supabase = createServerClient();

  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (fErr || !fund) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404 });
  }

  let q = supabase
    .from('vc_reporting_obligations')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .order('due_date', { ascending: true });

  if (year && /^\d{4}$/.test(year)) {
    q = q.eq('period_year', Number(year));
  }
  if (reportType && reportType !== 'all') {
    q = q.eq('report_type', reportType);
  }
  if (status && status !== 'all') {
    q = q.eq('status', status);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ obligations: data ?? [] });
}
