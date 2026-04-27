import { deriveComplianceStatus } from '@/lib/portfolio/compliance-fund-rows';
import { num, toUsdEquivalent } from '@/lib/portfolio/capital-calls';
import {
  formatMetricIrr,
  formatMetricRatio,
  latestSnapshotByFund,
  metricsForSnapshot,
} from '@/lib/portfolio/fund-performance-metrics';
import type { VcCapitalCall, VcDistribution, VcFundSnapshot } from '@/types/database';

export const JMD_USD_FALLBACK = 157;

export const EXEC_CHART_FUND_COLORS = ['#0B1F45', '#C8973A', '#0F8A6E', '#3B82F6'] as const;

export type ExecObligation = {
  id: string;
  status: string;
  report_type: string;
  due_date: string;
  period_label?: string | null;
  days_overdue?: number | null;
};

export type ExecFundRow = {
  id: string;
  fund_name: string;
  manager_name: string | null;
  currency: string;
  listed: boolean;
  notes: string | null;
  dbj_commitment: unknown;
  exchange_rate_jmd_usd: unknown | null;
  fund_category?: string | null;
  is_pvc?: boolean | null;
  dbj_pro_rata_pct?: number | null;
  vc_reporting_obligations: ExecObligation[] | null;
};

export type ExecCapitalCallRow = {
  id: string;
  fund_id: string;
  call_amount: unknown;
  currency: string;
  status: string;
  date_of_notice: string;
  notice_number: number;
  total_called_to_date: unknown | null;
  vc_capital_call_items: {
    id: string;
    purpose_category: string;
    amount: unknown;
    investee_company: string | null;
    description: string | null;
    currency: string;
  }[] | null;
};

export type ExecDistributionRow = {
  fund_id: string;
  distribution_date: string;
  amount: unknown;
  currency: string;
};

function fundRate(f: ExecFundRow): number {
  const r = f.exchange_rate_jmd_usd;
  return r != null ? num(r) : JMD_USD_FALLBACK;
}

function abbrevFundName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.slice(0, 8).toUpperCase();
  const ini = parts
    .slice(0, 4)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return ini.slice(0, 8);
}

function totalCalledForFund(
  calls: ExecCapitalCallRow[],
  fundId: string,
  dbjCommitment: number,
): number {
  const list = calls
    .filter((c) => c.fund_id === fundId && c.status !== 'cancelled')
    .sort((a, b) => a.notice_number - b.notice_number);
  if (list.length === 0) return 0;
  const last = list[list.length - 1]!;
  if (last.total_called_to_date != null) return num(last.total_called_to_date);
  return list.reduce((s, c) => s + num(c.call_amount), 0);
}

export function fmtUsdShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `USD ${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `USD ${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `USD ${(n / 1e3).toFixed(0)}K`;
  return `USD ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtNative(amount: number, currency: string): string {
  const cur = currency === 'JMD' ? 'JMD' : 'USD';
  return `${cur} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export type ExecutiveFundTableRow = {
  id: string;
  fund_name: string;
  fund_category: string | null;
  manager_name: string;
  currency: string;
  listed: boolean;
  committed_display: string;
  called_display: string;
  pct_called: number;
  returned_display: string;
  yield_pct: number | null;
  compliance_status: string;
  overdue_count: number;
  committed_usd: number;
  called_usd: number;
  returned_usd: number;
};

export type ExecutiveOverdueRow = {
  fund_name: string;
  period_label: string;
  report_type: string;
  due_date: string;
  days_overdue: number;
};

export type ExecutiveInvestmentRow = {
  id: string;
  company: string;
  fund_name: string;
  amount_display: string;
  currency: string;
  date: string;
};

export type ExecutiveChartsPayload = {
  commitmentBars: { abbr: string; fullName: string; committed: number; called: number }[];
  distributionStack: {
    rows: Record<string, string | number>[];
    series: { dataKey: string; name: string; color: string; fundId: string }[];
  };
  compliancePie: { name: string; value: number; fill: string }[];
  allocationPie: { name: string; value: number; fill: string }[];
  /** Investment line items as % of total called (USD), for donut center. */
  allocationCenterPctOfCalled: number;
};

export type ExecutiveTotals = {
  committed_usd: number;
  called_usd: number;
  pct_called: number;
  returned_usd: number;
  yield_pct: number | null;
  compliant_count: number;
  fund_count: number;
  total_overdue: number;
};

export type ExecutiveSummary = {
  active_funds: number;
  total_committed_usd: string;
  total_called_usd: string;
  pct_called_of_commitment: number;
  total_returned_usd: string;
  yield_on_commitment_pct: number | null;
};

export type ExecutiveFundPerformanceRow = {
  fund_id: string;
  fund_name: string;
  dpi: string;
  tvpi: string;
  calculated_irr: string;
  reported_irr: string;
  /** Latest approved quarterly assessment (Epic 13), display strings. */
  assessment_display: string;
  recommendation_display: string;
};

export type ExecutiveViewModel = {
  funds: ExecutiveFundTableRow[];
  summary: ExecutiveSummary;
  totals: ExecutiveTotals;
  topOverdue: ExecutiveOverdueRow[];
  investments: ExecutiveInvestmentRow[];
  fees_usd: number;
  investments_usd: number;
  compliance_counts: { fully: number; audits: number; reports: number; partial: number; nodata: number };
  charts: ExecutiveChartsPayload;
  fundNotes: { fund_name: string; notes: string }[];
  performance_summary: ExecutiveFundPerformanceRow[];
};

export type ExecutiveLatestAssessment = {
  weighted_total_score: number | null;
  category: string | null;
  divestment_recommendation: string | null;
};

export function buildExecutiveView(
  fundsRaw: ExecFundRow[] | null,
  callsRaw: ExecCapitalCallRow[] | null,
  distRaw: ExecDistributionRow[] | null,
  snapshotsRaw: VcFundSnapshot[] | null = null,
  latestApprovedAssessmentByFundId: Record<string, ExecutiveLatestAssessment> | null = null,
): ExecutiveViewModel {
  const funds = fundsRaw ?? [];
  const activeIds = new Set(funds.map((f) => f.id));
  const calls = (callsRaw ?? []).filter((c) => activeIds.has(c.fund_id));
  const distributions = (distRaw ?? []).filter((d) => activeIds.has(d.fund_id));

  const fundById = new Map(funds.map((f) => [f.id, f]));

  const distSumByFund = new Map<string, { native: number; usd: number; cur: string }>();
  for (const d of distributions) {
    const f = fundById.get(d.fund_id);
    const rate = f ? fundRate(f) : JMD_USD_FALLBACK;
    const amt = num(d.amount);
    const usd = toUsdEquivalent(amt, d.currency, rate);
    const prev = distSumByFund.get(d.fund_id) ?? { native: 0, usd: 0, cur: d.currency };
    prev.native += amt;
    prev.usd += usd;
    distSumByFund.set(d.fund_id, prev);
  }

  const tableRows: ExecutiveFundTableRow[] = funds.map((f) => {
    const obs = f.vc_reporting_obligations ?? [];
    const compliance_status = deriveComplianceStatus(
      obs.map((o) => ({ due_date: o.due_date, status: o.status, report_type: o.report_type })),
    );
    const overdue_count = obs.filter((o) => o.status === 'overdue').length;
    const dbj = num(f.dbj_commitment);
    const rate = fundRate(f);
    const committed_usd = toUsdEquivalent(dbj, f.currency, rate);
    const called_native = totalCalledForFund(calls, f.id, dbj);
    const called_usd = toUsdEquivalent(called_native, f.currency, rate);
    const pct_called = dbj > 0 ? Math.round((called_native / dbj) * 1000) / 10 : 0;
    const distAgg = distSumByFund.get(f.id);
    const returned_native = distAgg?.native ?? 0;
    const returned_usd = distAgg?.usd ?? 0;
    const yield_pct =
      returned_native > 0 && dbj > 0 ? Math.round((returned_native / dbj) * 1000) / 10 : null;

    return {
      id: f.id,
      fund_name: f.fund_name,
      fund_category: f.fund_category ?? null,
      manager_name: f.manager_name?.trim() || '—',
      currency: f.currency,
      listed: f.listed,
      committed_display: fmtNative(dbj, f.currency),
      called_display: fmtNative(called_native, f.currency),
      pct_called,
      returned_display: returned_native > 0 ? fmtNative(returned_native, f.currency) : '—',
      yield_pct,
      compliance_status,
      overdue_count,
      committed_usd,
      called_usd,
      returned_usd,
    };
  });

  let total_committed_usd = 0;
  let total_called_usd = 0;
  let total_returned_usd = 0;
  let compliant_count = 0;
  let total_overdue = 0;

  for (const r of tableRows) {
    total_committed_usd += r.committed_usd;
    total_called_usd += r.called_usd;
    total_returned_usd += r.returned_usd;
    if (r.compliance_status === 'fully_compliant') compliant_count += 1;
    total_overdue += r.overdue_count;
  }

  const pct_called_of_commitment =
    total_committed_usd > 0 ? Math.round((total_called_usd / total_committed_usd) * 1000) / 10 : 0;
  const yield_on_commitment_pct =
    total_returned_usd > 0 && total_committed_usd > 0
      ? Math.round((total_returned_usd / total_committed_usd) * 1000) / 10
      : null;

  const summary: ExecutiveSummary = {
    active_funds: funds.length,
    total_committed_usd: fmtUsdShort(total_committed_usd),
    total_called_usd: fmtUsdShort(total_called_usd),
    pct_called_of_commitment,
    total_returned_usd: fmtUsdShort(total_returned_usd),
    yield_on_commitment_pct,
  };

  const totals: ExecutiveTotals = {
    committed_usd: total_committed_usd,
    called_usd: total_called_usd,
    pct_called: pct_called_of_commitment,
    returned_usd: total_returned_usd,
    yield_pct: yield_on_commitment_pct,
    compliant_count,
    fund_count: funds.length,
    total_overdue,
  };

  const overdueFlat: ExecutiveOverdueRow[] = [];
  for (const f of funds) {
    for (const o of f.vc_reporting_obligations ?? []) {
      if (o.status !== 'overdue') continue;
      const days =
        typeof o.days_overdue === 'number' && !Number.isNaN(o.days_overdue)
          ? o.days_overdue
          : 0;
      overdueFlat.push({
        fund_name: f.fund_name,
        period_label: o.period_label?.trim() || '—',
        report_type: o.report_type,
        due_date: o.due_date,
        days_overdue: days,
      });
    }
  }
  overdueFlat.sort((a, b) => b.days_overdue - a.days_overdue);
  const topOverdue = overdueFlat.slice(0, 10);

  const investments: ExecutiveInvestmentRow[] = [];
  let fees_usd = 0;
  let investments_usd = 0;

  for (const c of calls) {
    const fund = fundById.get(c.fund_id);
    const rate = fund ? fundRate(fund) : JMD_USD_FALLBACK;
    for (const it of c.vc_capital_call_items ?? []) {
      const amt = num(it.amount);
      const usd = toUsdEquivalent(amt, it.currency, rate);
      if (it.purpose_category === 'investment') {
        investments_usd += usd;
        const company =
          it.investee_company?.trim() || it.description?.trim() || 'Investment';
        investments.push({
          id: it.id,
          company,
          fund_name: fund?.fund_name ?? '—',
          amount_display: fmtNative(amt, it.currency),
          currency: it.currency,
          date: c.date_of_notice,
        });
      } else {
        fees_usd += usd;
      }
    }
  }
  investments.sort((a, b) => (a.date < b.date ? 1 : -1));

  const commitmentBars = funds.map((f) => {
    const row = tableRows.find((r) => r.id === f.id)!;
    return {
      abbr: abbrevFundName(f.fund_name),
      fullName: f.fund_name,
      committed: row.committed_usd,
      called: row.called_usd,
    };
  });

  const yearFundUsd = new Map<string, Map<string, number>>();
  const fundsWithDist = new Set<string>();
  for (const d of distributions) {
    fundsWithDist.add(d.fund_id);
    const y = d.distribution_date.slice(0, 4);
    const f = fundById.get(d.fund_id);
    const rate = f ? fundRate(f) : JMD_USD_FALLBACK;
    const usd = toUsdEquivalent(num(d.amount), d.currency, rate);
    if (!yearFundUsd.has(y)) yearFundUsd.set(y, new Map());
    const m = yearFundUsd.get(y)!;
    m.set(d.fund_id, (m.get(d.fund_id) ?? 0) + usd);
  }
  const sortedYears = [...yearFundUsd.keys()].sort();
  const distFundIds = [...fundsWithDist].sort();
  const distSeries = distFundIds.map((fid, i) => {
    const name = fundById.get(fid)?.fund_name ?? fid;
    const dataKey = `f_${fid.replace(/-/g, '_')}`;
    return {
      dataKey,
      fundId: fid,
      name,
      color: EXEC_CHART_FUND_COLORS[i % EXEC_CHART_FUND_COLORS.length]!,
    };
  });
  const rows: Record<string, string | number>[] = sortedYears.map((year) => {
    const row: Record<string, string | number> = { year };
    const byFund = yearFundUsd.get(year) ?? new Map();
    for (const s of distSeries) {
      row[s.dataKey] = Math.round((byFund.get(s.fundId) ?? 0) * 100) / 100;
    }
    return row;
  });

  let audits = 0;
  let reports = 0;
  let fully = 0;
  let partial = 0;
  let nodata = 0;
  for (const r of tableRows) {
    if (r.compliance_status === 'fully_compliant') fully += 1;
    else if (r.compliance_status === 'audits_outstanding') audits += 1;
    else if (r.compliance_status === 'reports_outstanding') reports += 1;
    else if (r.compliance_status === 'partially_compliant') partial += 1;
    else nodata += 1;
  }
  const compliancePie = [
    { name: 'Fully Compliant', value: fully, fill: '#0F8A6E' },
    { name: 'Audits Outstanding', value: audits, fill: '#F59E0B' },
    { name: 'Reports Outstanding', value: reports, fill: '#C8973A' },
  ];
  if (partial > 0) {
    compliancePie.push({ name: 'In Progress', value: partial, fill: '#3B82F6' });
  }
  if (nodata > 0) {
    compliancePie.push({ name: 'No Data', value: nodata, fill: '#9CA3AF' });
  }

  const allocationPie = [
    { name: 'Investments', value: Math.round(investments_usd * 100) / 100, fill: '#0B1F45' },
    { name: 'Fees', value: Math.round(fees_usd * 100) / 100, fill: '#9CA3AF' },
  ].filter((p) => p.value > 0);
  const allocationCenterPctOfCalled =
    total_called_usd > 0 ? Math.round((investments_usd / total_called_usd) * 1000) / 10 : 0;

  const fundNotes = funds
    .filter((f) => f.notes && f.notes.trim())
    .map((f) => ({ fund_name: f.fund_name, notes: f.notes!.trim() }));

  const latestSnapByFund = latestSnapshotByFund(snapshotsRaw ?? []);
  const assessMap = latestApprovedAssessmentByFundId ?? {};
  const performance_summary: ExecutiveFundPerformanceRow[] = funds.map((f) => {
    const snap = latestSnapByFund.get(f.id) ?? null;
    const as = assessMap[f.id];
    const assessment_display =
      as?.weighted_total_score != null && as.category
        ? `${Number(as.weighted_total_score).toFixed(1)} · ${as.category}`
        : '—';
    const recommendation_display = as?.divestment_recommendation ? as.divestment_recommendation.replace(/_/g, ' ') : '—';
    if (!snap) {
      return {
        fund_id: f.id,
        fund_name: f.fund_name,
        dpi: '—',
        tvpi: '—',
        calculated_irr: '—',
        reported_irr: '—',
        assessment_display,
        recommendation_display,
      };
    }
    const fc = calls.filter((c) => c.fund_id === f.id) as unknown as VcCapitalCall[];
    const fd = distributions.filter((d) => d.fund_id === f.id) as unknown as VcDistribution[];
    const m = metricsForSnapshot(!!f.is_pvc, fc, fd, snap, f.dbj_pro_rata_pct ?? null);
    return {
      fund_id: f.id,
      fund_name: f.fund_name,
      dpi: formatMetricRatio(m.dpi),
      tvpi: formatMetricRatio(m.tvpi),
      calculated_irr: formatMetricIrr(m.calculated_irr),
      reported_irr: formatMetricIrr(snap.reported_irr != null ? Number(snap.reported_irr) : null),
      assessment_display,
      recommendation_display,
    };
  });

  return {
    funds: tableRows,
    summary,
    totals,
    topOverdue,
    investments,
    fees_usd,
    investments_usd,
    compliance_counts: { fully, audits, reports, partial, nodata },
    charts: {
      commitmentBars,
      distributionStack: { rows, series: distSeries },
      compliancePie: compliancePie.filter((p) => p.value > 0),
      allocationPie,
      allocationCenterPctOfCalled,
    },
    fundNotes,
    performance_summary,
  };
}

export const REPORT_TYPE_LABELS_EXEC: Record<string, string> = {
  quarterly_financial: 'Quarterly Fin.',
  quarterly_investment_mgmt: 'Quarterly Inv.',
  audited_annual: 'Annual Audit',
  inhouse_quarterly: 'In-house',
};
