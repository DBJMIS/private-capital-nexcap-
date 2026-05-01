import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { byTypeTotals, toUsdEquivalent } from '@/lib/portfolio/distributions';
import { num } from '@/lib/portfolio/capital-calls';
import type { VcDistribution } from '@/types/database';

export const dynamic = 'force-dynamic';

type FundRow = {
  id: string;
  fund_name: string;
  currency: string;
  dbj_commitment: unknown;
  exchange_rate_jmd_usd: unknown;
};

export async function GET() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const { data: fundsRaw, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id, fund_name, currency, dbj_commitment, exchange_rate_jmd_usd')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_status', 'active')
    .order('fund_name');
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  const funds = (fundsRaw ?? []) as FundRow[];
  const fundIds = funds.map((f) => f.id);
  if (fundIds.length === 0) {
    return NextResponse.json({
      funds: [],
      all_distributions: [],
      chart_by_year: [],
      returns_by_fund: [],
      kpi: {
        total_returned_usd_equiv: 0,
        avg_yield_pct: 0,
        most_active_fund: null,
        funds_with_no_returns_count: 0,
        funds_with_no_returns: [],
      },
    });
  }

  const { data: distRaw, error: dErr } = await supabase
    .from('vc_distributions')
    .select(
      'id, tenant_id, fund_id, distribution_number, distribution_date, return_type, amount, currency, units, per_unit_amount, cumulative_total, source_company, notes, reference_number, created_by, created_at, updated_at',
    )
    .eq('tenant_id', profile.tenant_id)
    .in('fund_id', fundIds);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  const allRows = (distRaw ?? []) as VcDistribution[];

  const fundById = new Map(funds.map((f) => [f.id, f]));
  const grouped = new Map<string, VcDistribution[]>();
  for (const row of allRows) {
    const list = grouped.get(row.fund_id) ?? [];
    list.push(row);
    grouped.set(row.fund_id, list);
  }

  const summaries = funds.map((fund) => {
    const rows = (grouped.get(fund.id) ?? []).sort((a, b) => a.distribution_number - b.distribution_number);
    const total_amount = rows.reduce((sum, row) => sum + num(row.amount), 0);
    const commitment = num(fund.dbj_commitment);
    const yield_pct = commitment > 0 ? Math.round((total_amount / commitment) * 1000) / 10 : 0;
    const by_type = byTypeTotals(rows);
    const last_distribution_date = rows.length === 0 ? null : rows[rows.length - 1]!.distribution_date;
    return {
      fund_id: fund.id,
      fund_name: fund.fund_name,
      currency: fund.currency,
      total_distributions: rows.length,
      total_amount,
      yield_pct,
      last_distribution_date,
      by_type,
    };
  });

  const all_distributions = allRows
    .map((row) => {
      const fund = fundById.get(row.fund_id);
      const rate = fund?.exchange_rate_jmd_usd != null ? num(fund.exchange_rate_jmd_usd) : 157;
      return {
        ...row,
        fund_name: fund?.fund_name ?? 'Fund',
        usd_equiv_amount: toUsdEquivalent(num(row.amount), row.currency, rate),
      };
    })
    .sort((a, b) => (a.distribution_date < b.distribution_date ? 1 : -1));

  const yearTotals = new Map<number, number>();
  for (const row of allRows) {
    const fund = fundById.get(row.fund_id);
    const rate = fund?.exchange_rate_jmd_usd != null ? num(fund.exchange_rate_jmd_usd) : 157;
    const year = Number(row.distribution_date.slice(0, 4));
    yearTotals.set(year, (yearTotals.get(year) ?? 0) + toUsdEquivalent(num(row.amount), row.currency, rate));
  }
  const chart_by_year = [...yearTotals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, total_usd]) => ({ year: String(year), total_usd }));

  const returns_by_fund = summaries
    .map((summary) => {
      const fund = fundById.get(summary.fund_id);
      const rate = fund?.exchange_rate_jmd_usd != null ? num(fund.exchange_rate_jmd_usd) : 157;
      const total_usd = toUsdEquivalent(summary.total_amount, summary.currency, rate);
      return {
        fund_id: summary.fund_id,
        fund_name: summary.fund_name,
        total_usd,
        total_amount: summary.total_amount,
        currency: summary.currency,
      };
    })
    .filter((row) => row.total_usd > 0)
    .sort((a, b) => b.total_usd - a.total_usd);

  let total_returned_usd_equiv = 0;
  for (const summary of summaries) {
    const fund = fundById.get(summary.fund_id)!;
    const rate = fund.exchange_rate_jmd_usd != null ? num(fund.exchange_rate_jmd_usd) : 157;
    total_returned_usd_equiv += toUsdEquivalent(summary.total_amount, summary.currency, rate);
  }

  const withReturns = summaries.filter((row) => row.total_distributions > 0);
  let weightedCommitmentUsd = 0;
  let weightedReturnedUsd = 0;
  for (const row of withReturns) {
    const fund = fundById.get(row.fund_id)!;
    const rate = fund.exchange_rate_jmd_usd != null ? num(fund.exchange_rate_jmd_usd) : 157;
    weightedCommitmentUsd += toUsdEquivalent(num(fund.dbj_commitment), fund.currency, rate);
    weightedReturnedUsd += toUsdEquivalent(row.total_amount, row.currency, rate);
  }
  const avg_yield_pct =
    weightedCommitmentUsd > 0 ? Math.round((weightedReturnedUsd / weightedCommitmentUsd) * 1000) / 10 : 0;

  const most_active_fund =
    summaries.length === 0
      ? null
      : [...summaries].sort((a, b) => b.total_distributions - a.total_distributions)[0] ?? null;

  const funds_with_no_returns = summaries.filter((row) => row.total_distributions === 0).map((row) => row.fund_name);

  return NextResponse.json({
    funds: summaries,
    all_distributions,
    chart_by_year,
    returns_by_fund,
    kpi: {
      total_returned_usd_equiv,
      avg_yield_pct,
      most_active_fund,
      funds_with_no_returns_count: funds_with_no_returns.length,
      funds_with_no_returns,
    },
  });
}
