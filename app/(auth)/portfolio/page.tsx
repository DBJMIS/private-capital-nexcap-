import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import { AlertCircle, Building2, DollarSign, ShieldCheck } from 'lucide-react';

import type { PortfolioDashboardChartsProps } from './PortfolioDashboardCharts.client';
import { PortfolioIntelligenceCard } from './PortfolioIntelligenceCard.client';
import type { PortfolioDashboardAssistantPayload } from '@/components/portfolio/PortfolioDashboardAssistantBridge';
import { PortfolioAssistantGateClient } from './PortfolioAssistantGate.client';
import { loadComplianceFundRows } from '@/lib/portfolio/compliance-fund-rows';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Portfolio Dashboard',
};

export const dynamic = 'force-dynamic';

const PortfolioDashboardCharts = nextDynamic(
  () => import('./PortfolioDashboardCharts.client').then((m) => m.PortfolioDashboardCharts),
  {
    loading: () => <div className="h-[280px] animate-pulse rounded-xl bg-gray-100" />,
  },
);

const COMPLIANCE_COLORS: Record<string, string> = {
  fully_compliant: '#0F8A6E',
  audits_outstanding: '#F59E0B',
  reports_outstanding: '#C8973A',
  non_compliant: '#EF4444',
  partially_compliant: '#3B82F6',
  no_data: '#9CA3AF',
};

const COMPLIANCE_LABEL: Record<string, string> = {
  fully_compliant: 'Fully Compliant',
  audits_outstanding: 'Audits Outstanding',
  reports_outstanding: 'Reports Outstanding',
  non_compliant: 'Non-Compliant',
  partially_compliant: 'Partially Compliant',
  no_data: 'No Data',
};

const FUND_ABBREV_ENTRIES: [string, string][] = [
  ['Caribbean Mezzanine Fund II', 'CMF II'],
  ['Caribbean Venture Capital Fund', 'Caribbean VC'],
  ['JASMEF 1', 'JASMEF'],
  ['JMMB-Vertex SME Holdings', 'Vertex'],
  ['MPC Caribbean Clean Energy Fund', 'MPC CCEF'],
  ['NCBCM Stratus Private Equity', 'Stratus'],
  ['Portland JSX', 'Portland JSX'],
  ['Quantas Advantage Inc.', 'Quantas'],
  ['SEAF Global SME Growth Investments', 'SEAF'],
  ['Sygnus Credit Investments', 'Sygnus'],
];

function abbreviateFundName(name: string): string {
  const t = name.trim();
  for (const [full, abbr] of FUND_ABBREV_ENTRIES) {
    if (t.toLowerCase() === full.toLowerCase()) return abbr;
  }
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1]}`;
  return t.slice(0, 12) + (t.length > 12 ? '…' : '');
}

function fmtCompactUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `USD ${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `USD ${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `USD ${(n / 1e3).toFixed(0)}K`;
  return `USD ${Math.round(n).toLocaleString()}`;
}

function toUsdFromNested(currency: string, dbjCommitment: number, exchangeRateJmdUsd: number | null): number {
  const n = Number(dbjCommitment);
  if (currency === 'JMD') {
    const rate = Number(exchangeRateJmdUsd ?? 157) || 157;
    return n / rate;
  }
  return n;
}

type NestedObligation = { status: string; due_date: string; report_type?: string };
type NestedFund = {
  id: string;
  currency: string;
  dbj_commitment: number | string;
  fund_status?: string;
  exchange_rate_jmd_usd?: number | string | null;
  vc_reporting_obligations?: NestedObligation[] | null;
};

function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00`);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default async function PortfolioPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const supabase = createServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const [{ funds, rows, error }, aiNarrativeRes, wlRes] = await Promise.all([
    loadComplianceFundRows(supabase, profile.tenant_id),
    supabase
      .from('ai_benchmark_narratives')
      .select('narrative, headline_stats, created_at')
      .eq('scope', 'full_portfolio')
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('vc_watchlist').select('fund_id').eq('tenant_id', profile.tenant_id),
  ]);
  const complianceRows = rows;

  if (error) {
    return <p className="text-sm text-red-700">Could not load portfolio: {error}</p>;
  }

  const nestedFunds = (funds ?? []) as NestedFund[];
  const activeFunds = complianceRows.length;
  const watchFundIds = new Set(
    (wlRes.error ? [] : (wlRes.data ?? [])).map((r) => String((r as { fund_id: string }).fund_id)),
  );
  const nestedById = new Map(nestedFunds.map((f) => [f.id, f]));

  let totalUsdCommitted = 0;
  for (const f of nestedFunds) {
    totalUsdCommitted += toUsdFromNested(
      String(f.currency ?? 'USD'),
      Number(f.dbj_commitment),
      f.exchange_rate_jmd_usd != null ? Number(f.exchange_rate_jmd_usd) : null,
    );
  }

  const allObligations = nestedFunds.flatMap((f) => f.vc_reporting_obligations ?? []);
  const hasAnyObligations = allObligations.length > 0;

  const today = startOfDay(new Date());
  const day14 = addDays(today, 14);

  const overdueReportsCount = allObligations.filter((o) => o.status === 'overdue').length;

  const dueInNext14 = allObligations.filter((o) => {
    const d = startOfDay(parseYmd(o.due_date));
    return d.getTime() >= today.getTime() && d.getTime() <= day14.getTime();
  }).length;

  const totalOverdueItems = overdueReportsCount;

  const fullyCompliant = complianceRows.filter((r) => r.compliance_status === 'fully_compliant').length;
  const needAttention = Math.max(
    0,
    activeFunds -
      fullyCompliant -
      complianceRows.filter((r) => r.compliance_status === 'no_data').length,
  );

  const barData = [...complianceRows]
    .map((r) => ({
      name: abbreviateFundName(r.fund_name),
      fullName: r.fund_name,
      overdue: r.overdue,
      status: r.compliance_status,
      fill: COMPLIANCE_COLORS[r.compliance_status] ?? COMPLIANCE_COLORS.no_data,
    }))
    .sort((a, b) => b.overdue - a.overdue);

  const pieStatusOrder = [
    'fully_compliant',
    'audits_outstanding',
    'reports_outstanding',
    'non_compliant',
    'partially_compliant',
    'no_data',
  ] as const;
  const pieCounts = new Map<string, number>();
  for (const r of complianceRows) {
    const k = r.compliance_status;
    pieCounts.set(k, (pieCounts.get(k) ?? 0) + 1);
  }
  const pieData = pieStatusOrder
    .map((status) => ({
      name: COMPLIANCE_LABEL[status] ?? status,
      value: pieCounts.get(status) ?? 0,
      fill: COMPLIANCE_COLORS[status] ?? COMPLIANCE_COLORS.no_data,
    }))
    .filter((d) => d.value > 0);

  const statusCounts = {
    accepted: allObligations.filter((o) => o.status === 'accepted' || o.status === 'waived').length,
    pending: allObligations.filter((o) => o.status === 'pending').length,
    overdue: allObligations.filter((o) => o.status === 'overdue').length,
    outstanding: allObligations.filter((o) => o.status === 'outstanding').length,
    due_soon: allObligations.filter((o) => o.status === 'due').length,
    submitted: allObligations.filter((o) => o.status === 'submitted' || o.status === 'under_review').length,
  };

  const obligationBars = [
    { status: 'Accepted', count: statusCounts.accepted, fill: '#0F8A6E' },
    { status: 'Pending', count: statusCounts.pending, fill: '#9CA3AF' },
    { status: 'Overdue', count: statusCounts.overdue, fill: '#EF4444' },
    { status: 'Outstanding', count: statusCounts.outstanding, fill: '#F59E0B' },
    { status: 'Due Soon', count: statusCounts.due_soon, fill: '#C8973A' },
    { status: 'Submitted', count: statusCounts.submitted, fill: '#3B82F6' },
  ];

  const end90 = addDays(today, 90);
  const monthBuckets: { start: Date; end: Date; label: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const start = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + i + 1, 0);
    end.setHours(23, 59, 59, 999);
    monthBuckets.push({ start, end, label: monthLabel(start) });
  }

  const timelineMonths = monthBuckets.map(({ start, end, label }) => {
    let count = 0;
    for (const o of allObligations) {
      const d = parseYmd(o.due_date);
      if (d.getTime() < today.getTime() || d.getTime() > end90.getTime()) continue;
      if (d.getTime() < start.getTime() || d.getTime() > end.getTime()) continue;
      count += 1;
    }
    return { month: label, count };
  });

  const todayStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const chartProps: PortfolioDashboardChartsProps = {
    activeFunds,
    barData,
    pieData,
    obligationBars,
    timelineMonths,
    totalOverdueItems,
    countsFully: complianceRows.filter((r) => r.compliance_status === 'fully_compliant').length,
    countsAudits: complianceRows.filter((r) => r.compliance_status === 'audits_outstanding').length,
    countsReports: complianceRows.filter((r) => r.compliance_status === 'reports_outstanding').length,
    hasAnyFunds: activeFunds > 0,
    hasAnyObligations,
  };

  const initialIntelligence = aiNarrativeRes.data
    ? {
        narrative: String((aiNarrativeRes.data as { narrative: string }).narrative ?? ''),
        headline_stats: (((aiNarrativeRes.data as { headline_stats: unknown }).headline_stats as Array<{
          label: string;
          value: string;
          context: string;
        }>) ?? []),
        generated_at: String((aiNarrativeRes.data as { created_at: string }).created_at),
      }
    : null;
  const canRegenerate = profile.role === 'it_admin' || profile.role === 'portfolio_manager' || can(profile, 'write:applications');

  const assistantPayload: PortfolioDashboardAssistantPayload = {
    totalFunds: activeFunds,
    totalCommittedCapital: totalUsdCommitted,
    totalCalledCapital: null,
    totalDistributions: null,
    totalNAV: null,
    deploymentRate: null,
    averageMOIC: null,
    averageIRR: null,
    fundsOnWatchlist: watchFundIds.size,
    complianceOverdue: overdueReportsCount,
    fundsDueInNext14Days: dueInNext14,
    fullyCompliantFunds: fullyCompliant,
    fundsNeedingAttention: needAttention,
    funds: complianceRows.map((r) => {
      const nf = nestedById.get(r.fund_id);
      const committedUsd = nf
        ? toUsdFromNested(
            String(nf.currency ?? 'USD'),
            Number(nf.dbj_commitment),
            nf.exchange_rate_jmd_usd != null ? Number(nf.exchange_rate_jmd_usd) : null,
          )
        : toUsdFromNested(String(r.currency ?? 'USD'), Number(r.dbj_commitment), null);
      return {
        name: r.fund_name,
        committedCapital: committedUsd,
        calledCapital: null,
        distributions: null,
        nav: null,
        moic: null,
        irr: null,
        status: nf?.fund_status ?? r.compliance_status,
        onWatchlist: watchFundIds.has(r.fund_id),
      };
    }),
    note: 'Aggregated performance multiples and paid-in capital breakdown are not shown on this dashboard; open a fund for detail.',
  };

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45]">Portfolio Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">DBJ Active Fund Monitoring</p>
        </div>
        <p className="text-sm text-gray-400">{todayStr}</p>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-blue-500 bg-white p-5">
          <Building2 className="absolute right-5 top-5 h-5 w-5 text-blue-500" aria-hidden />
          <p className="text-3xl font-bold text-[#0B1F45]">{activeFunds}</p>
          <p className="mt-1 text-sm text-gray-600">Active Funds</p>
          <p className="mt-2 text-xs text-gray-400">Under monitoring</p>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0B1F45] bg-white p-5">
          <DollarSign className="absolute right-5 top-5 h-5 w-5 text-[#0B1F45]" aria-hidden />
          <p className="text-3xl font-bold text-[#0B1F45]">{fmtCompactUsd(totalUsdCommitted)}</p>
          <p className="mt-1 text-sm text-gray-600">DBJ Committed</p>
          <p className="mt-2 text-xs text-gray-400">USD equivalent</p>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-red-500 bg-white p-5">
          <AlertCircle className="absolute right-5 top-5 h-5 w-5 text-red-500" aria-hidden />
          <p className="text-3xl font-bold text-red-600">{overdueReportsCount}</p>
          <p className="mt-1 text-sm text-gray-600">Overdue Reports</p>
          {dueInNext14 > 0 ? (
            <p className="mt-2 text-xs font-medium text-amber-600">{dueInNext14} due in next 14 days</p>
          ) : (
            <p className="mt-2 text-xs font-medium text-[#0F8A6E]">None due soon</p>
          )}
        </div>

        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0F8A6E] bg-white p-5">
          <ShieldCheck className="absolute right-5 top-5 h-5 w-5 text-[#0F8A6E]" aria-hidden />
          <p className="text-3xl font-bold text-[#0B1F45]">
            {activeFunds === 0 ? '—' : `${fullyCompliant} / ${activeFunds}`}
          </p>
          <p className="mt-1 text-sm text-gray-600">Fully Compliant</p>
          <p
            className={
              needAttention > 0 ? 'mt-2 text-xs font-medium text-amber-600' : 'mt-2 text-xs font-medium text-gray-400'
            }
          >
            {needAttention > 0 ? `${needAttention} funds need attention` : 'All funds on track'}
          </p>
        </div>
      </div>

      <PortfolioIntelligenceCard initial={initialIntelligence} canRegenerate={canRegenerate} />

      <PortfolioDashboardCharts {...chartProps} />

      <PortfolioAssistantGateClient payload={assistantPayload} />
    </div>
  );
}
