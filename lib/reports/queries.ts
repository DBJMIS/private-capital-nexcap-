/**
 * Server-side aggregations for executive reporting (tenant-scoped).
 * File path: lib/reports/queries.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applicationAsOfDate,
  applicationInDateRange,
  applicationMatchesGeography,
  applicationMatchesSector,
  type ReportFilters,
} from '@/lib/reports/filters';
import { derivePerformanceBand, isReportingOverdue } from '@/lib/portfolio/flags';
import type { RepaymentStatus } from '@/lib/portfolio/types';
import { sectorFromApplication } from '@/lib/portfolio/queries';

export const CRITERIA_LABELS: Record<string, string> = {
  firm: 'FIRM',
  fundraising: 'FUNDRAISING',
  team: 'TEAM',
  investment_strategy: 'STRATEGY',
  investment_process: 'PROCESS',
  representative_pipeline: 'PIPELINE',
  governance: 'GOVERNANCE',
};

type AppRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  geographic_area: string;
  country_of_incorporation: string;
  onboarding_metadata?: unknown;
};

export function filterApplications(apps: AppRow[], f: ReportFilters): AppRow[] {
  return apps.filter(
    (a) =>
      applicationInDateRange(a, f.dateFrom, f.dateTo) &&
      applicationMatchesSector(a, f.sector) &&
      applicationMatchesGeography(a, f.geography) &&
      a.status !== 'draft',
  );
}

export async function loadApplicationsForReports(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AppRow[]> {
  const { data, error } = await supabase
    .from('vc_fund_applications')
    .select('id, status, submitted_at, created_at, geographic_area, country_of_incorporation, onboarding_metadata')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (error) {
    const parts = [error.message, error.details, error.hint].filter(Boolean);
    throw new Error(parts.join(' — ') || 'Failed to load applications');
  }
  return (data ?? []) as AppRow[];
}

export type KpiBundle = {
  totalApplicationsThisYear: number;
  preScreenPassRatePct: number | null;
  avgAssessmentScore: number | null;
  totalCapitalApprovedUsd: number;
  totalCapitalDeployedUsd: number;
  activePortfolioCount: number;
  investmentsAtRiskCount: number;
  investmentsAtRiskPct: number | null;
  pendingApprovalsCount: number;
};

export async function getExecutiveKpis(
  supabase: SupabaseClient,
  tenantId: string,
  filterApps: AppRow[],
  f: ReportFilters,
  applicationsThisYearCount: number,
): Promise<KpiBundle> {
  const appIds = new Set(filterApps.map((a) => a.id));

  const { data: checklists, error: ce } = await supabase
    .from('vc_pre_screening_checklists')
    .select('application_id, reviewed_at, overall_pass')
    .eq('tenant_id', tenantId);

  if (ce) throw new Error(ce.message);

  const reviewed = (checklists ?? []).filter((c: { application_id: string; reviewed_at: string | null }) => {
    if (!c.reviewed_at || !appIds.has(c.application_id)) return false;
    if (!f.dateFrom) return true;
    const t = new Date(c.reviewed_at).getTime();
    return t >= f.dateFrom.getTime() && t <= f.dateTo.getTime();
  });
  const passed = reviewed.filter((c: { overall_pass: boolean | null }) => c.overall_pass === true);
  const preScreenPassRatePct =
    reviewed.length > 0 ? Math.round((passed.length / reviewed.length) * 1000) / 10 : null;

  const { data: assessments, error: ae } = await supabase
    .from('vc_assessments')
    .select('application_id, overall_score, status')
    .eq('tenant_id', tenantId)
    .in('status', ['completed', 'approved']);

  if (ae) throw new Error(ae.message);

  const completedScores = (assessments ?? [])
    .filter((x: { application_id: string; overall_score: number | null }) => appIds.has(x.application_id))
    .map((x: { overall_score: number | null }) => x.overall_score)
    .filter((s): s is number => s != null && !Number.isNaN(Number(s)));

  const avgAssessmentScore =
    completedScores.length > 0
      ? Math.round((completedScores.reduce((a, b) => a + Number(b), 0) / completedScores.length) * 10) / 10
      : null;

  const { data: investments, error: ie } = await supabase
    .from('vc_investments')
    .select(
      'id, application_id, approved_amount_usd, disbursed_amount_usd, status, portfolio_latest_score, portfolio_last_snapshot_date',
    )
    .eq('tenant_id', tenantId);

  if (ie) throw new Error(ie.message);

  const invFiltered = (investments ?? []).filter((i: { application_id: string }) => appIds.has(i.application_id));

  let totalCapitalApprovedUsd = 0;
  let totalCapitalDeployedUsd = 0;
  for (const i of invFiltered) {
    totalCapitalApprovedUsd += Number(i.approved_amount_usd) || 0;
    totalCapitalDeployedUsd += Number(i.disbursed_amount_usd) || 0;
  }

  const activeIds = invFiltered
    .filter((i: { status: string }) => i.status === 'active' || i.status === 'on_hold')
    .map((i: { id: string }) => i.id);

  const activePortfolioCount = activeIds.length;

  let investmentsAtRiskCount = 0;
  if (activeIds.length > 0) {
    const { data: snaps, error: se } = await supabase
      .from('vc_portfolio_snapshots')
      .select('investment_id, snapshot_date, repayment_status, performance_score')
      .eq('tenant_id', tenantId)
      .in('investment_id', activeIds)
      .order('snapshot_date', { ascending: false });

    if (se) throw new Error(se.message);

    const latestByInv = new Map<
      string,
      { repayment_status: RepaymentStatus; snapshot_date: string; performance_score: number | null }
    >();
    for (const s of snaps ?? []) {
      if (!latestByInv.has(s.investment_id)) {
        latestByInv.set(s.investment_id, {
          repayment_status: s.repayment_status as RepaymentStatus,
          snapshot_date: s.snapshot_date,
          performance_score: s.performance_score != null ? Number(s.performance_score) : null,
        });
      }
    }

    const invById = new Map(invFiltered.map((i) => [i.id, i]));

    for (const invId of activeIds) {
      const inv = invById.get(invId) as {
        portfolio_latest_score: number | null;
        portfolio_last_snapshot_date: string | null;
      } | undefined;
      const snap = latestByInv.get(invId);
      const repayment = snap?.repayment_status ?? 'current';
      const score = snap?.performance_score ?? (inv?.portfolio_latest_score != null ? Number(inv.portfolio_latest_score) : null);
      const lastDt = snap?.snapshot_date ?? inv?.portfolio_last_snapshot_date ?? null;
      const overdue = isReportingOverdue(lastDt);
      const band = derivePerformanceBand({
        performance_score: score,
        repayment_status: repayment,
        reporting_overdue: overdue,
      });
      if (band === 'underperforming' || band === 'critical' || overdue) investmentsAtRiskCount += 1;
    }
  }

  const investmentsAtRiskPct =
    activePortfolioCount > 0
      ? Math.round((investmentsAtRiskCount / activePortfolioCount) * 1000) / 10
      : null;

  const { count: pendingCount, error: pe } = await supabase
    .from('vc_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending');

  if (pe) throw new Error(pe.message);

  return {
    totalApplicationsThisYear: applicationsThisYearCount,
    preScreenPassRatePct,
    avgAssessmentScore,
    totalCapitalApprovedUsd,
    totalCapitalDeployedUsd,
    activePortfolioCount,
    investmentsAtRiskCount,
    investmentsAtRiskPct,
    pendingApprovalsCount: pendingCount ?? 0,
  };
}

export type FunnelStage = {
  key: string;
  label: string;
  count: number;
};

export async function getPipelineFunnel(
  supabase: SupabaseClient,
  tenantId: string,
  filterApps: AppRow[],
): Promise<FunnelStage[]> {
  const appIds = filterApps.map((a) => a.id);
  const idSet = new Set(appIds);
  if (appIds.length === 0) {
    return [
      { key: 'applications', label: 'Applications', count: 0 },
      { key: 'pre_screened', label: 'Pre-Screened', count: 0 },
      { key: 'dd_complete', label: 'DD Complete', count: 0 },
      { key: 'assessed', label: 'Assessed', count: 0 },
      { key: 'approved', label: 'Approved', count: 0 },
      { key: 'funded', label: 'Funded', count: 0 },
    ];
  }

  const { data: checklists } = await supabase
    .from('vc_pre_screening_checklists')
    .select('application_id, reviewed_at')
    .eq('tenant_id', tenantId)
    .in('application_id', appIds);

  const preScreened = new Set(
    (checklists ?? [])
      .filter((c: { reviewed_at: string | null; application_id: string }) => c.reviewed_at && idSet.has(c.application_id))
      .map((c: { application_id: string }) => c.application_id),
  );

  const { data: ddqs } = await supabase
    .from('vc_dd_questionnaires')
    .select('application_id, status')
    .eq('tenant_id', tenantId)
    .in('application_id', appIds);

  const ddComplete = new Set(
    (ddqs ?? [])
      .filter(
        (q: { status: string; application_id: string }) =>
          q.status === 'completed' && idSet.has(q.application_id),
      )
      .map((q: { application_id: string }) => q.application_id),
  );

  const { data: assess } = await supabase
    .from('vc_assessments')
    .select('application_id, status')
    .eq('tenant_id', tenantId)
    .in('application_id', appIds);

  const assessed = new Set(
    (assess ?? [])
      .filter(
        (a: { status: string; application_id: string }) =>
          (a.status === 'completed' || a.status === 'approved') && idSet.has(a.application_id),
      )
      .map((a: { application_id: string }) => a.application_id),
  );

  const approvedApps = new Set(filterApps.filter((a) => a.status === 'approved').map((a) => a.id));

  const { data: deals } = await supabase
    .from('vc_deals')
    .select('application_id, stage')
    .eq('tenant_id', tenantId)
    .in('application_id', appIds);

  const funded = new Set(
    (deals ?? [])
      .filter((d: { stage: string; application_id: string }) => d.stage === 'funded' && idSet.has(d.application_id))
      .map((d: { application_id: string }) => d.application_id),
  );

  const nApps = filterApps.length;
  const nPre = [...preScreened].filter((id) => idSet.has(id)).length;
  const nDd = [...ddComplete].filter((id) => idSet.has(id)).length;
  const nAss = [...assessed].filter((id) => idSet.has(id)).length;
  const nAppr = [...approvedApps].filter((id) => idSet.has(id)).length;
  const nFund = [...funded].filter((id) => idSet.has(id)).length;

  return [
    { key: 'applications', label: 'Applications', count: nApps },
    { key: 'pre_screened', label: 'Pre-Screened', count: nPre },
    { key: 'dd_complete', label: 'DD Complete', count: nDd },
    { key: 'assessed', label: 'Assessed', count: nAss },
    { key: 'approved', label: 'Approved', count: nAppr },
    { key: 'funded', label: 'Funded', count: nFund },
  ];
}

export type CapitalSummary = {
  totalApprovedUsd: number;
  totalDeployedUsd: number;
  byMonth: { month: string; deployedUsd: number; cumulativeUsd: number }[];
};

export async function getCapitalSummary(
  supabase: SupabaseClient,
  tenantId: string,
  filterApps: AppRow[],
  f: ReportFilters,
): Promise<CapitalSummary> {
  const appIds = new Set(filterApps.map((a) => a.id));

  const { data: investments } = await supabase
    .from('vc_investments')
    .select('id, application_id, approved_amount_usd, disbursed_amount_usd')
    .eq('tenant_id', tenantId);

  const invFiltered = (investments ?? []).filter((i: { application_id: string }) => appIds.has(i.application_id));

  let totalApprovedUsd = 0;
  let totalDeployedUsd = 0;
  for (const i of invFiltered) {
    totalApprovedUsd += Number(i.approved_amount_usd) || 0;
    totalDeployedUsd += Number(i.disbursed_amount_usd) || 0;
  }

  const invIds = invFiltered.map((i: { id: string }) => i.id);
  if (invIds.length === 0) {
    return { totalApprovedUsd, totalDeployedUsd, byMonth: [] };
  }

  const { data: disb } = await supabase
    .from('vc_disbursements')
    .select('investment_id, amount_usd, disbursement_date')
    .eq('tenant_id', tenantId)
    .eq('status', 'disbursed')
    .in('investment_id', invIds);

  const rows = (disb ?? []).filter((d: { disbursement_date: string }) => {
    if (!f.dateFrom) return true;
    const t = new Date(d.disbursement_date).getTime();
    return t >= f.dateFrom.getTime() && t <= f.dateTo.getTime();
  });

  const byMonthMap = new Map<string, number>();
  for (const d of rows) {
    const dt = new Date(d.disbursement_date);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonthMap.set(key, (byMonthMap.get(key) ?? 0) + (Number(d.amount_usd) || 0));
  }

  const keys = [...byMonthMap.keys()].sort();
  let cum = 0;
  const byMonth = keys.map((k) => {
    const deployedUsd = byMonthMap.get(k) ?? 0;
    cum += deployedUsd;
    const [y, m] = k.split('-');
    return { month: `${y}-${m}`, deployedUsd, cumulativeUsd: cum };
  });

  return { totalApprovedUsd, totalDeployedUsd, byMonth };
}

export type PortfolioSummary = {
  performing: number;
  watch: number;
  underperforming: number;
  critical: number;
  sectorDeployed: { sector: string; deployedUsd: number }[];
};

export async function getPortfolioSummary(
  supabase: SupabaseClient,
  tenantId: string,
  filterApps: AppRow[],
): Promise<PortfolioSummary> {
  const appById = new Map(filterApps.map((a) => [a.id, a]));
  const appIds = [...appById.keys()];

  const { data: investments } = await supabase
    .from('vc_investments')
    .select(
      'id, application_id, disbursed_amount_usd, status, portfolio_latest_score, portfolio_last_snapshot_date',
    )
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'on_hold']);

  const invFiltered = (investments ?? []).filter((i: { application_id: string }) => appIds.includes(i.application_id));

  const performing = { performing: 0, watch: 0, underperforming: 0, critical: 0 };
  const sectorMap = new Map<string, number>();

  const activeIds = invFiltered.map((i: { id: string }) => i.id);

  const { data: snapRows } =
    activeIds.length > 0
      ? await supabase
          .from('vc_portfolio_snapshots')
          .select('investment_id, snapshot_date, repayment_status, performance_score')
          .eq('tenant_id', tenantId)
          .in('investment_id', activeIds)
          .order('snapshot_date', { ascending: false })
      : { data: [] as { investment_id: string; snapshot_date: string; repayment_status: string; performance_score: number | null }[] };

  const latestByInv = new Map<
    string,
    { repayment_status: RepaymentStatus; snapshot_date: string; performance_score: number | null }
  >();
  for (const s of snapRows ?? []) {
    if (!latestByInv.has(s.investment_id)) {
      latestByInv.set(s.investment_id, {
        repayment_status: s.repayment_status as RepaymentStatus,
        snapshot_date: s.snapshot_date,
        performance_score: s.performance_score != null ? Number(s.performance_score) : null,
      });
    }
  }

  for (const inv of invFiltered) {
    const app = appById.get(inv.application_id);
    const sector = sectorFromApplication(app ?? null);
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + (Number(inv.disbursed_amount_usd) || 0));

    const snap = latestByInv.get(inv.id);
    const invRow = inv as {
      portfolio_latest_score: number | null;
      portfolio_last_snapshot_date: string | null;
    };
    const repayment = snap?.repayment_status ?? 'current';
    const score =
      snap?.performance_score ??
      (invRow.portfolio_latest_score != null ? Number(invRow.portfolio_latest_score) : null);
    const lastDt = snap?.snapshot_date ?? invRow.portfolio_last_snapshot_date ?? null;
    const band = derivePerformanceBand({
      performance_score: score,
      repayment_status: repayment,
      reporting_overdue: isReportingOverdue(lastDt),
    });
    if (band === 'performing') performing.performing += 1;
    else if (band === 'watch') performing.watch += 1;
    else if (band === 'underperforming') performing.underperforming += 1;
    else performing.critical += 1;
  }

  const sectorDeployed = [...sectorMap.entries()]
    .map(([sector, deployedUsd]) => ({ sector, deployedUsd }))
    .sort((a, b) => b.deployedUsd - a.deployedUsd);

  return { ...performing, sectorDeployed };
}

export type AssessmentAnalytics = {
  histogram: { bucketLabel: string; bucketMid: number; minScore: number; maxScore: number; count: number }[];
  assessments: { application_id: string; overall_score: number | null }[];
};

export function buildScoreHistogram(scores: number[]): AssessmentAnalytics['histogram'] {
  const buckets: { minScore: number; maxScore: number; label: string }[] = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    buckets.push({
      minScore: lo,
      maxScore: hi,
      label: `${lo}–${hi}`,
    });
  }
  const counts = buckets.map(() => 0);
  for (const s of scores) {
    const idx = Math.min(9, Math.max(0, Math.floor(s / 10)));
    counts[idx] += 1;
  }
  return buckets.map((b, i) => ({
    bucketLabel: b.label,
    bucketMid: b.minScore + 5,
    minScore: b.minScore,
    maxScore: b.maxScore,
    count: counts[i],
  }));
}

export async function getAssessmentAnalytics(
  supabase: SupabaseClient,
  tenantId: string,
  filterApps: AppRow[],
): Promise<AssessmentAnalytics> {
  const appIds = filterApps.map((a) => a.id);
  if (appIds.length === 0) {
    return { histogram: buildScoreHistogram([]), assessments: [] };
  }

  const { data: assessments, error } = await supabase
    .from('vc_assessments')
    .select('application_id, overall_score, status')
    .eq('tenant_id', tenantId)
    .in('status', ['completed', 'approved'])
    .in('application_id', appIds);

  if (error) throw new Error(error.message);

  const rows = (assessments ?? []).filter(
    (a: { overall_score: number | null }) => a.overall_score != null && !Number.isNaN(Number(a.overall_score)),
  );
  const scores = rows.map((a: { overall_score: number | null }) => Number(a.overall_score));
  return {
    histogram: buildScoreHistogram(scores),
    assessments: rows.map((a: { application_id: string; overall_score: number | null }) => ({
      application_id: a.application_id,
      overall_score: a.overall_score != null ? Number(a.overall_score) : null,
    })),
  };
}

export type CriteriaBreakdownRow = { key: string; label: string; avgScore: number | null };

export async function getCriteriaBreakdown(
  supabase: SupabaseClient,
  tenantId: string,
  filterApps: AppRow[],
): Promise<CriteriaBreakdownRow[]> {
  const appIds = filterApps.map((a) => a.id);
  const keys = Object.keys(CRITERIA_LABELS);
  if (appIds.length === 0) {
    return keys.map((k) => ({ key: k, label: CRITERIA_LABELS[k] ?? k, avgScore: null }));
  }

  const { data: assessments } = await supabase
    .from('vc_assessments')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('status', ['completed', 'approved'])
    .in('application_id', appIds);

  const assessmentIds = (assessments ?? []).map((a: { id: string }) => a.id);
  if (assessmentIds.length === 0) {
    return keys.map((k) => ({ key: k, label: CRITERIA_LABELS[k] ?? k, avgScore: null }));
  }

  const { data: criteria, error } = await supabase
    .from('vc_assessment_criteria')
    .select('criteria_key, raw_score, weighted_score, max_points')
    .eq('tenant_id', tenantId)
    .in('assessment_id', assessmentIds);

  if (error) throw new Error(error.message);

  const sums = new Map<string, { sum: number; n: number }>();
  for (const k of keys) sums.set(k, { sum: 0, n: 0 });

  for (const row of criteria ?? []) {
    const ck = row.criteria_key as string;
    if (!sums.has(ck)) continue;
    let val: number | null = null;
    if (row.weighted_score != null && !Number.isNaN(Number(row.weighted_score))) {
      val = Number(row.weighted_score);
    } else if (row.raw_score != null && row.max_points != null && Number(row.max_points) > 0) {
      val = (Number(row.raw_score) / 5) * 100;
    } else if (row.raw_score != null) {
      val = (Number(row.raw_score) / 5) * 100;
    }
    if (val == null) continue;
    const cur = sums.get(ck)!;
    cur.sum += val;
    cur.n += 1;
  }

  return keys.map((k) => {
    const cur = sums.get(k)!;
    const avgScore = cur.n > 0 ? Math.round((cur.sum / cur.n) * 10) / 10 : null;
    return { key: k, label: CRITERIA_LABELS[k] ?? k, avgScore };
  });
}

