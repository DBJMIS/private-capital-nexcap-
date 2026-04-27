import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import {
  buildCashFlowsForXirr,
  buildMonthlyPerformanceChart,
  computeFundPerformanceMetrics,
  enrichSnapshotsWithMetrics,
  pickLatestSnapshot,
  calledThroughDate,
  distributedThroughDate,
  type FundPerformanceMetrics,
  type FundPerformanceSnapshotRow,
  type MonthlyChartPoint,
} from '@/lib/portfolio/fund-performance-metrics';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import type { VcCapitalCall, VcDistribution, VcFundSnapshot } from '@/types/database';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function maxYmd(...dates: (string | null | undefined)[]): string {
  const valid = dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0) {
    const t = new Date();
    return t.toISOString().slice(0, 10);
  }
  return valid.sort((a, b) => (a < b ? -1 : 1))[valid.length - 1]!;
}

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fundId } = await ctx.params;
  const supabase = createServerClient();

  const { data: fund, error: fundErr } = await supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (fundErr) return NextResponse.json({ error: fundErr.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = fund as PortfolioFundRow;
  const isPvc = !!row.is_pvc;
  const dbjProRataPct = row.dbj_pro_rata_pct ?? null;

  const [callsRes, distRes, snapRes] = await Promise.all([
    supabase
      .from('vc_capital_calls')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .order('notice_number', { ascending: true }),
    supabase
      .from('vc_distributions')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .order('distribution_date', { ascending: true }),
    supabase
      .from('vc_fund_snapshots')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', fundId)
      .order('snapshot_date', { ascending: false }),
  ]);

  if (callsRes.error) return NextResponse.json({ error: callsRes.error.message }, { status: 500 });
  if (distRes.error) return NextResponse.json({ error: distRes.error.message }, { status: 500 });
  if (snapRes.error) return NextResponse.json({ error: snapRes.error.message }, { status: 500 });

  const calls = (callsRes.data ?? []) as VcCapitalCall[];
  const distributions = (distRes.data ?? []) as VcDistribution[];
  const snapshots = (snapRes.data ?? []) as VcFundSnapshot[];

  const latest = pickLatestSnapshot(snapshots);
  const asOf = latest?.snapshot_date ?? maxYmd(...calls.map((c) => c.date_of_notice), ...distributions.map((d) => d.distribution_date));

  const total_called = calledThroughDate(calls, asOf);
  const total_distributed = distributedThroughDate(distributions, asOf);
  const nav = latest != null ? Number(latest.nav) : null;

  let latest_metrics: FundPerformanceMetrics | null = null;
  if (isPvc) {
    latest_metrics = computeFundPerformanceMetrics(isPvc, total_called, total_distributed, nav ?? 0, [], [], dbjProRataPct);
  } else if (latest != null && nav != null) {
    const { dates, amounts } = buildCashFlowsForXirr(calls, distributions, nav, latest.snapshot_date, dbjProRataPct);
    latest_metrics = computeFundPerformanceMetrics(isPvc, total_called, total_distributed, nav, dates, amounts, dbjProRataPct);
  }

  const { points: cash_flow_history } =
    latest != null && nav != null && nav > 0
      ? buildCashFlowsForXirr(calls, distributions, nav, latest.snapshot_date, dbjProRataPct)
      : buildCashFlowsForXirr(calls, distributions, 0, asOf);

  const chart: MonthlyChartPoint[] = buildMonthlyPerformanceChart(calls, distributions, snapshots);
  const snapshots_enriched: FundPerformanceSnapshotRow[] = enrichSnapshotsWithMetrics(
    isPvc,
    calls,
    distributions,
    snapshots,
    dbjProRataPct,
  );

  const reported_irr = latest?.reported_irr != null ? Number(latest.reported_irr) : null;

  return NextResponse.json({
    fund_id: fundId,
    is_pvc: isPvc,
    currency: row.currency,
    latest_snapshot: latest,
    latest_metrics,
    reported_irr,
    total_called,
    total_distributed,
    nav,
    as_of: asOf,
    cash_flow_history,
    chart,
    snapshots: snapshots_enriched,
  });
}
