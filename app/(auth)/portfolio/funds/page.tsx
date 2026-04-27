import type { Metadata } from 'next';

import { FundMonitoringClient } from '@/components/portfolio/FundMonitoringClient';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import type { ObligationLite } from '@/lib/portfolio/compliance';
import { deriveComplianceStatus } from '@/lib/portfolio/compliance-fund-rows';
import { refreshObligationStatuses } from '@/lib/portfolio/reporting-engine';
import { latestSnapshotByFund, monitorDpiTvpiForFund } from '@/lib/portfolio/fund-performance-metrics';
import type { PortfolioFundRow, PortfolioFundRowWithMonitorMetrics } from '@/lib/portfolio/types';
import type { VcCapitalCall, VcDistribution, VcFundSnapshot } from '@/types/database';

export const metadata: Metadata = {
  title: 'Fund Monitoring',
};

export const dynamic = 'force-dynamic';

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
  await refreshObligationStatuses(supabase, profile.tenant_id);

  const { data: funds } = await supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_status', 'active')
    .order('fund_name', { ascending: true });

  const fundRowsRaw = (funds ?? []) as PortfolioFundRowWithMonitorMetrics[];
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
      supabase.from('vc_capital_calls').select('*').eq('tenant_id', profile.tenant_id).in('fund_id', ids),
      supabase.from('vc_distributions').select('*').eq('tenant_id', profile.tenant_id).in('fund_id', ids),
      supabase.from('vc_fund_snapshots').select('*').eq('tenant_id', profile.tenant_id).in('fund_id', ids),
    ]);

    for (const row of obs ?? []) {
      const r = row as { fund_id: string; report_type: string; status: string; due_date: string };
      const list = obligationsByFund.get(r.fund_id) ?? [];
      list.push({ report_type: r.report_type, status: r.status, due_date: r.due_date });
      obligationsByFund.set(r.fund_id, list);
    }

    for (const c of (calls ?? []) as VcCapitalCall[]) {
      const list = callsByFund.get(c.fund_id) ?? [];
      list.push(c);
      callsByFund.set(c.fund_id, list);
    }
    for (const d of (dists ?? []) as VcDistribution[]) {
      const list = distByFund.get(d.fund_id) ?? [];
      list.push(d);
      distByFund.set(d.fund_id, list);
    }

    latestSnaps = latestSnapshotByFund((snaps ?? []) as VcFundSnapshot[]);
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
