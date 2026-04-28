import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  computeFundObligationOverview,
  type FundObligationOverviewObligation,
} from '@/lib/portfolio/fund-obligation-overview';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId } = await ctx.params;
  const url = new URL(req.url);

  if (url.searchParams.get('overview') === '1') {
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

    const { data: all, error } = await supabase
      .from('vc_reporting_obligations')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .order('due_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const overview = computeFundObligationOverview((all ?? []) as FundObligationOverviewObligation[]);
    return NextResponse.json({ overview });
  }

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

  const year = url.searchParams.get('year');
  const reportType = url.searchParams.get('report_type');
  const status = url.searchParams.get('status');
  const sort = url.searchParams.get('sort') === 'due_asc' ? 'due_asc' : 'due_desc';

  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const rawSize = Number.parseInt(url.searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));

  let q = supabase
    .from('vc_reporting_obligations')
    .select('*', { count: 'exact' })
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId);

  if (year && /^\d{4}$/.test(year)) {
    q = q.eq('period_year', Number(year));
  }
  if (reportType && reportType !== 'all') {
    q = q.eq('report_type', reportType);
  }
  if (status && status !== 'all') {
    q = q.eq('status', status);
  }

  const ascending = sort === 'due_asc';
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await q.order('due_date', { ascending }).order('id', { ascending }).range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    obligations: data ?? [],
    total,
    page,
    page_size: pageSize,
    total_pages: totalPages,
  });
}
