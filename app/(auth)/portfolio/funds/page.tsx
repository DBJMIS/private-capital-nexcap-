import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';

import { FundMonitoringClient } from '@/components/portfolio/FundMonitoringClient';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import type { ObligationLite } from '@/lib/portfolio/compliance';
import { deriveComplianceStatus } from '@/lib/portfolio/compliance-fund-rows';
import { latestSnapshotByFund, monitorDpiTvpiForFund } from '@/lib/portfolio/fund-performance-metrics';
import type { PortfolioFundRow, PortfolioFundRowWithMonitorMetrics } from '@/lib/portfolio/types';
import type { VcCapitalCall, VcDistribution, VcFundSnapshot } from '@/types/database';

export const metadata: Metadata = {
  title: 'Fund Monitoring',
};

export const dynamic = 'force-dynamic';

/** List view only — avoids large JSONB / text columns not used by Fund Monitoring. */
const FUND_MONITORING_LIST_SELECT = [
  'id',
  'tenant_id',
  'application_id',
  'commitment_id',
  'fund_name',
  'manager_name',
  'fund_representative',
  'manager_email',
  'manager_phone',
  'currency',
  'total_fund_commitment',
  'dbj_commitment',
  'dbj_pro_rata_pct',
  'listed',
  'fund_status',
  'year_end_month',
  'quarterly_report_due_days',
  'audit_report_due_days',
  'requires_quarterly_financial',
  'requires_quarterly_inv_mgmt',
  'requires_audited_annual',
  'requires_inhouse_quarterly',
  'report_months',
  'audit_month',
  'exchange_rate_jmd_usd',
  'commitment_date',
  'fund_close_date',
  'fund_life_years',
  'investment_period_years',
  'contacts',
  'notes',
  'created_by',
  'created_at',
  'updated_at',
  'fund_category',
  'fund_end_date',
  'is_pvc',
  'management_fee_pct',
  'performance_fee_pct',
  'hurdle_rate_pct',
  'target_irr_pct',
].join(', ');

const CAPITAL_CALL_MONITORING_SELECT = `
  id,
  fund_id,
  call_amount,
  currency,
  status,
  date_of_notice,
  notice_number,
  total_called_to_date,
  vc_capital_call_items (
    id,
    purpose_category,
    amount,
    investee_company,
    description,
    currency
  )
`;

const DISTRIBUTION_MONITORING_SELECT = 'id, fund_id, distribution_date, amount, currency';

const SNAPSHOT_MONITORING_SELECT =
  'id, tenant_id, fund_id, period_year, period_quarter, snapshot_date, nav, committed_capital, distributions_in_period, reported_irr, investor_remark, source_obligation_id, created_at, updated_at';

const loadFundMonitoringBase = unstable_cache(
  async (tenantId: string) => {
    const supabase = createServerClient();
    const { data: funds } = await supabase
      .from('vc_portfolio_funds')
      .select(FUND_MONITORING_LIST_SELECT)
      .eq('tenant_id', tenantId)
      .eq('fund_status', 'active')
      .order('fund_name', { ascending: true });
    return funds ?? [];
  },
  ['fund-monitoring-base'],
  { revalidate: 300 },
);

function toUsd(fund: PortfolioFundRow): number {
  const n = Number(fund.dbj_commitment);
  if (fund.currency === 'JMD') {
    const rate = Number(fund.exchange_rate_jmd_usd ?? 157) || 157;
    return n / rate;
  }
  return n;
}

export default async function PortfolioFundsPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const supabase = createServerClient();

  const funds = await loadFundMonitoringBase(profile.tenant_id);

  const fundRowsRaw = (funds ?? []) as unknown as PortfolioFundRowWithMonitorMetrics[];
  const ids = fundRowsRaw.map((f) => f.id);
  const obligationsByFund = new Map<string, ObligationLite[]>();
  const callsByFund = new Map<string, VcCapitalCall[]>();
  const distByFund = new Map<string, VcDistribution[]>();
  let latestSnaps = new Map<string, VcFundSnapshot>();

  if (ids.length > 0) {
    const [{ data: obs }, { data: calls }, { data: dists }, { data: snaps }] = await Promise.all([
      supabase
        .from('vc_reporting_obligations')
        .select('fund_id, report_type, status, due_date')
        .eq('tenant_id', profile.tenant_id)
        .in('fund_id', ids),
      supabase.from('vc_capital_calls').select(CAPITAL_CALL_MONITORING_SELECT).eq('tenant_id', profile.tenant_id).in('fund_id', ids),
      supabase
        .from('vc_distributions')
        .select(DISTRIBUTION_MONITORING_SELECT)
        .eq('tenant_id', profile.tenant_id)
        .in('fund_id', ids),
      supabase.from('vc_fund_snapshots').select(SNAPSHOT_MONITORING_SELECT).eq('tenant_id', profile.tenant_id).in('fund_id', ids),
    ]);

    for (const row of obs ?? []) {
      const r = row as { fund_id: string; report_type: string; status: string; due_date: string };
      const list = obligationsByFund.get(r.fund_id) ?? [];
      list.push({ report_type: r.report_type, status: r.status, due_date: r.due_date });
      obligationsByFund.set(r.fund_id, list);
    }

    for (const c of (calls ?? []) as unknown as VcCapitalCall[]) {
      const list = callsByFund.get(c.fund_id) ?? [];
      list.push(c);
      callsByFund.set(c.fund_id, list);
    }
    for (const d of (dists ?? []) as unknown as VcDistribution[]) {
      const list = distByFund.get(d.fund_id) ?? [];
      list.push(d);
      distByFund.set(d.fund_id, list);
    }

    latestSnaps = latestSnapshotByFund((snaps ?? []) as unknown as VcFundSnapshot[]);
  }

  const fundRows: PortfolioFundRowWithMonitorMetrics[] = fundRowsRaw.map((f) => {
    const latest = latestSnaps.get(f.id) ?? null;
    const { dpi, tvpi } = monitorDpiTvpiForFund(
      !!f.is_pvc,
      callsByFund.get(f.id) ?? [],
      distByFund.get(f.id) ?? [],
      latest,
      f.dbj_pro_rata_pct ?? null,
    );
    return { ...f, dpi, tvpi };
  });

  let totalUsd = 0;
  let fully = 0;
  let attention = 0;
  for (const f of fundRows) {
    totalUsd += toUsd(f);
    const obs = obligationsByFund.get(f.id) ?? [];
    const st = deriveComplianceStatus(obs);
    if (st === 'fully_compliant') fully += 1;
    else if (st !== 'no_data') attention += 1;
  }

  const obligationEntries = Array.from(obligationsByFund.entries()) as [string, ObligationLite[]][];

  return (
    <FundMonitoringClient
      funds={fundRows}
      obligationEntries={obligationEntries}
      canAddFund={can(profile, 'write:applications')}
      totalUsd={totalUsd}
      fullyCompliant={fully}
      attentionCount={attention}
    />
  );
}
