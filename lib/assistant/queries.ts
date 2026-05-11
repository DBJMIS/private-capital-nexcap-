import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

// ─────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────

export type FundSummary = {
  id: string;
  fund_name: string;
  manager_name: string;
  fund_manager_id: string | null;
  currency: string;
  fund_status: string;
  fund_category: string | null;
  sector_focus: string[] | null;
  dbj_commitment: number;
  total_fund_commitment: number;
  dbj_pro_rata_pct: number;
  commitment_date: string;
  fund_end_date: string | null;
  target_irr_pct: number | null;
  hurdle_rate_pct: number | null;
  is_pvc: boolean;
};

export type ComplianceFundSummary = {
  fund_id: string;
  fund_name: string;
  manager_name: string;
  currency: string;
  total: number;
  overdue: number;
  accepted: number;
  submitted: number;
  pending: number;
  due: number;
  compliance_rate: number | null;
  max_days_overdue: number;
  oldest_overdue_period: string | null;
};

export type CapitalCallSummary = {
  fund_id: string;
  fund_name: string;
  currency: string;
  notice_number: number;
  date_of_notice: string;
  due_date: string | null;
  date_paid: string | null;
  call_amount: number;
  total_called_to_date: number | null;
  remaining_commitment: number | null;
  status: string;
  notes: string | null;
};

export type DistributionSummary = {
  fund_id: string;
  fund_name: string;
  currency: string;
  distribution_number: number;
  distribution_date: string;
  return_type: string;
  amount: number;
  cumulative_total: number | null;
  source_company: string | null;
  notes: string | null;
};

export type PerformanceSummary = {
  fund_id: string;
  fund_name: string;
  currency: string;
  dbj_commitment: number;
  total_called: number;
  total_paid: number;
  remaining_commitment: number;
  deployment_pct: number | null;
  nav: number | null;
  reported_irr: number | null;
  distributions_in_period: number | null;
  dpi: number | null;
  tvpi: number | null;
  snapshot_period: string | null;
  has_snapshot: boolean;
};

export type WatchlistEntry = {
  fund_id: string;
  fund_name: string;
  manager_name: string;
  placed_on_watchlist: string;
  consecutive_quarters: number;
  escalated: boolean;
  escalated_at: string | null;
  notes: string | null;
  latest_score: number | null;
  latest_category: string | null;
};

export type AssessmentSummary = {
  fund_id: string;
  fund_name: string;
  assessment_period: string;
  assessment_date: string;
  weighted_total_score: number | null;
  category: string | null;
  status: string;
  financial_performance_score: number | null;
  compliance_governance_score: number | null;
  ai_summary: string | null;
};

export type ApplicationSummary = {
  id: string;
  fund_name: string;
  manager_name: string;
  status: string;
  submitted_at: string | null;
  total_capital_commitment_usd: number;
  geographic_area: string;
  cfp_title: string | null;
};

export type FundManagerSummary = {
  id: string;
  name: string;
  firm_name: string;
  email: string | null;
  funds: string[];
  primary_contact: string | null;
  primary_contact_email: string | null;
  portal_access: boolean;
};

export type DivestmentSummary = {
  fund_id: string;
  fund_name: string;
  company_name: string;
  divestment_type: string;
  completion_date: string;
  original_investment_amount: number;
  proceeds_received: number;
  currency: string;
  multiple_on_invested_capital: number | null;
  is_full_exit: boolean;
  exit_route: string | null;
  status: string;
};

type PortfolioFundRow = {
  id: string;
  fund_name: string;
  manager_name: string;
  fund_manager_id: string | null;
  currency: string;
  fund_status: string;
  fund_category: string | null;
  sector_focus: string[] | null;
  dbj_commitment: number | string;
  total_fund_commitment: number | string;
  dbj_pro_rata_pct: number | string;
  commitment_date: string;
  fund_end_date: string | null;
  target_irr_pct: number | string | null;
  hurdle_rate_pct: number | string | null;
  is_pvc: boolean;
};

type ObligationRow = {
  fund_id: string;
  status: string;
  days_overdue: number;
  period_label: string;
};

type CapitalCallRow = {
  fund_id: string;
  notice_number: number;
  date_of_notice: string;
  due_date: string | null;
  date_paid: string | null;
  call_amount: number | string;
  currency: string;
  total_called_to_date: number | string | null;
  remaining_commitment: number | string | null;
  status: string;
  notes: string | null;
  vc_portfolio_funds: { fund_name: string } | { fund_name: string }[] | null;
};

type DistributionRow = {
  fund_id: string;
  distribution_number: number;
  distribution_date: string;
  return_type: string;
  amount: number | string;
  currency: string;
  cumulative_total: number | string | null;
  source_company: string | null;
  notes: string | null;
  vc_portfolio_funds: { fund_name: string } | { fund_name: string }[] | null;
};

function nestedFundName(rel: CapitalCallRow['vc_portfolio_funds']): string {
  if (!rel) return '';
  const r = Array.isArray(rel) ? rel[0] : rel;
  return r?.fund_name ?? '';
}

function nestedFundNameDist(rel: DistributionRow['vc_portfolio_funds']): string {
  if (!rel) return '';
  const r = Array.isArray(rel) ? rel[0] : rel;
  return r?.fund_name ?? '';
}

// ─────────────────────────────────────
// QUERY 1 — Portfolio funds
// ─────────────────────────────────────

export async function queryPortfolioFunds(tenantId: string): Promise<FundSummary[]> {
  const db = createAdminClient();

  const { data, error } = await db
    .from('vc_portfolio_funds')
    .select(
      `
      id, fund_name, manager_name,
      fund_manager_id, currency, fund_status,
      fund_category, sector_focus,
      dbj_commitment, total_fund_commitment,
      dbj_pro_rata_pct, commitment_date,
      fund_end_date, target_irr_pct,
      hurdle_rate_pct, is_pvc
    `,
    )
    .eq('tenant_id', tenantId)
    .order('fund_name');

  if (error || !data) return [];
  return (data as PortfolioFundRow[]).map((f) => ({
    id: f.id,
    fund_name: f.fund_name,
    manager_name: f.manager_name,
    fund_manager_id: f.fund_manager_id,
    currency: f.currency,
    fund_status: f.fund_status,
    fund_category: f.fund_category,
    sector_focus: f.sector_focus,
    dbj_commitment: Number(f.dbj_commitment),
    total_fund_commitment: Number(f.total_fund_commitment),
    dbj_pro_rata_pct: Number(f.dbj_pro_rata_pct),
    commitment_date: f.commitment_date,
    fund_end_date: f.fund_end_date,
    target_irr_pct: f.target_irr_pct != null ? Number(f.target_irr_pct) : null,
    hurdle_rate_pct: f.hurdle_rate_pct != null ? Number(f.hurdle_rate_pct) : null,
    is_pvc: f.is_pvc,
  }));
}

// ─────────────────────────────────────
// QUERY 2 — Compliance summary
// ─────────────────────────────────────

export async function queryComplianceSummary(tenantId: string, fundId?: string): Promise<ComplianceFundSummary[]> {
  const db = createAdminClient();

  let fundsQuery = db
    .from('vc_portfolio_funds')
    .select('id, fund_name, manager_name, currency')
    .eq('tenant_id', tenantId);
  if (fundId) fundsQuery = fundsQuery.eq('id', fundId);
  const { data: funds } = await fundsQuery;
  if (!funds?.length) return [];

  let obligationsQuery = db
    .from('vc_reporting_obligations')
    .select('fund_id, status, days_overdue, period_label')
    .eq('tenant_id', tenantId);
  if (fundId) obligationsQuery = obligationsQuery.eq('fund_id', fundId);
  const { data: obligations } = await obligationsQuery;
  if (!obligations) return [];

  type Agg = {
    total: number;
    overdue: number;
    accepted: number;
    submitted: number;
    pending: number;
    due: number;
    max_days_overdue: number;
    oldest_overdue_period: string | null;
  };

  const byFund = new Map<string, Agg>();

  for (const fund of funds) {
    byFund.set(fund.id, {
      total: 0,
      overdue: 0,
      accepted: 0,
      submitted: 0,
      pending: 0,
      due: 0,
      max_days_overdue: 0,
      oldest_overdue_period: null,
    });
  }

  for (const ob of obligations as ObligationRow[]) {
    const agg = byFund.get(ob.fund_id);
    if (!agg) continue;
    agg.total++;
    const st = (ob.status ?? '').toLowerCase();
    if (st === 'overdue' || st === 'outstanding') {
      agg.overdue++;
      if (ob.days_overdue > agg.max_days_overdue) {
        agg.max_days_overdue = ob.days_overdue;
        agg.oldest_overdue_period = ob.period_label;
      }
    }
    if (st === 'accepted' || st === 'waived') agg.accepted++;
    if (st === 'submitted' || st === 'under_review') agg.submitted++;
    if (st === 'pending') agg.pending++;
    if (st === 'due') agg.due++;
  }

  return funds
    .map((fund) => {
      const agg =
        byFund.get(fund.id) ??
        ({
          total: 0,
          overdue: 0,
          accepted: 0,
          submitted: 0,
          pending: 0,
          due: 0,
          max_days_overdue: 0,
          oldest_overdue_period: null,
        } satisfies Agg);
      return {
        fund_id: fund.id,
        fund_name: fund.fund_name,
        manager_name: fund.manager_name,
        currency: fund.currency,
        ...agg,
        compliance_rate: agg.total > 0 ? Math.round((agg.accepted / agg.total) * 100) : null,
      };
    })
    .sort((a, b) => b.overdue - a.overdue);
}

// ─────────────────────────────────────
// QUERY 3 — Capital calls
// ─────────────────────────────────────

export async function queryCapitalCalls(
  tenantId: string,
  fundId?: string,
  status?: string,
): Promise<CapitalCallSummary[]> {
  const db = createAdminClient();

  let query = db
    .from('vc_capital_calls')
    .select(
      `
      fund_id, notice_number,
      date_of_notice, due_date, date_paid,
      call_amount, currency, status,
      total_called_to_date,
      remaining_commitment, notes,
      vc_portfolio_funds!inner(fund_name)
    `,
    )
    .eq('tenant_id', tenantId)
    .order('date_of_notice', { ascending: false });

  if (fundId) query = query.eq('fund_id', fundId);
  if (status) query = query.eq('status', status);

  const { data } = await query;
  if (!data) return [];

  return (data as CapitalCallRow[]).map((c) => ({
    fund_id: c.fund_id,
    fund_name: nestedFundName(c.vc_portfolio_funds),
    currency: c.currency,
    notice_number: c.notice_number,
    date_of_notice: c.date_of_notice,
    due_date: c.due_date,
    date_paid: c.date_paid,
    call_amount: Number(c.call_amount),
    total_called_to_date: c.total_called_to_date != null ? Number(c.total_called_to_date) : null,
    remaining_commitment: c.remaining_commitment != null ? Number(c.remaining_commitment) : null,
    status: c.status,
    notes: c.notes,
  }));
}

// ─────────────────────────────────────
// QUERY 4 — Distributions
// ─────────────────────────────────────

export async function queryDistributions(tenantId: string, fundId?: string): Promise<DistributionSummary[]> {
  const db = createAdminClient();

  let query = db
    .from('vc_distributions')
    .select(
      `
      fund_id, distribution_number,
      distribution_date, return_type,
      amount, currency, cumulative_total,
      source_company, notes,
      vc_portfolio_funds!inner(fund_name)
    `,
    )
    .eq('tenant_id', tenantId)
    .order('distribution_date', { ascending: false });

  if (fundId) query = query.eq('fund_id', fundId);

  const { data } = await query;
  if (!data) return [];

  return (data as DistributionRow[]).map((d) => ({
    fund_id: d.fund_id,
    fund_name: nestedFundNameDist(d.vc_portfolio_funds),
    currency: d.currency,
    distribution_number: d.distribution_number,
    distribution_date: d.distribution_date,
    return_type: d.return_type,
    amount: Number(d.amount),
    cumulative_total: d.cumulative_total != null ? Number(d.cumulative_total) : null,
    source_company: d.source_company,
    notes: d.notes,
  }));
}

// ─────────────────────────────────────
// QUERY 5 — Fund performance
// ─────────────────────────────────────

export async function queryFundPerformance(tenantId: string, fundId?: string): Promise<PerformanceSummary[]> {
  const db = createAdminClient();

  let fundsQuery = db
    .from('vc_portfolio_funds')
    .select('id, fund_name, currency, dbj_commitment')
    .eq('tenant_id', tenantId);
  if (fundId) fundsQuery = fundsQuery.eq('id', fundId);
  const { data: funds } = await fundsQuery;
  if (!funds?.length) return [];

  const { data: calls } = await db.from('vc_capital_calls').select('fund_id, call_amount, status').eq('tenant_id', tenantId);

  let snapshotQuery = db
    .from('vc_fund_snapshots')
    .select('fund_id, nav, reported_irr, distributions_in_period, period_year, period_quarter')
    .eq('tenant_id', tenantId);
  if (fundId) snapshotQuery = snapshotQuery.eq('fund_id', fundId);
  const { data: snapshots } = await snapshotQuery;

  type Snap = {
    nav: number | null;
    reported_irr: number | null;
    distributions_in_period: number | null;
    period_year: number;
    period_quarter: number;
  };

  const latestSnap = new Map<string, Snap>();
  const sorted = [...(snapshots ?? [])].sort((a, b) => {
    const ay = Number(a.period_year);
    const by = Number(b.period_year);
    if (ay !== by) return by - ay;
    return Number(b.period_quarter) - Number(a.period_quarter);
  });
  for (const s of sorted) {
    const fid = s.fund_id as string;
    if (!latestSnap.has(fid)) {
      latestSnap.set(fid, {
        nav: s.nav != null ? Number(s.nav) : null,
        reported_irr: s.reported_irr != null ? Number(s.reported_irr) : null,
        distributions_in_period: s.distributions_in_period != null ? Number(s.distributions_in_period) : null,
        period_year: Number(s.period_year),
        period_quarter: Number(s.period_quarter),
      });
    }
  }

  const callsByFund = new Map<string, { total_called: number; total_paid: number }>();
  for (const c of calls ?? []) {
    const fid = c.fund_id as string;
    const existing = callsByFund.get(fid) ?? { total_called: 0, total_paid: 0 };
    existing.total_called += Number(c.call_amount);
    if ((String(c.status ?? '').toLowerCase() === 'paid')) {
      existing.total_paid += Number(c.call_amount);
    }
    callsByFund.set(fid, existing);
  }

  return funds.map((fund: { id: string; fund_name: string; currency: string; dbj_commitment: number | string }) => {
    const snap = latestSnap.get(fund.id);
    const callData = callsByFund.get(fund.id) ?? { total_called: 0, total_paid: 0 };
    const dbjCommitment = Number(fund.dbj_commitment);
    const distributions = snap?.distributions_in_period ?? null;
    const nav = snap?.nav ?? null;
    const totalPaid = callData.total_paid;

    const dpi = totalPaid > 0 && distributions !== null ? distributions / totalPaid : null;

    const tvpi = totalPaid > 0 && nav !== null ? (nav + (distributions ?? 0)) / totalPaid : null;

    const deploymentPct = dbjCommitment > 0 ? (callData.total_called / dbjCommitment) * 100 : null;

    return {
      fund_id: fund.id,
      fund_name: fund.fund_name,
      currency: fund.currency,
      dbj_commitment: dbjCommitment,
      total_called: callData.total_called,
      total_paid: totalPaid,
      remaining_commitment: dbjCommitment - callData.total_called,
      deployment_pct: deploymentPct,
      nav,
      reported_irr: snap?.reported_irr ?? null,
      distributions_in_period: distributions,
      dpi,
      tvpi,
      snapshot_period: snap ? `Q${snap.period_quarter} ${snap.period_year}` : null,
      has_snapshot: snap !== undefined,
    };
  });
}

// ─────────────────────────────────────
// QUERY 6 — Watchlist
// ─────────────────────────────────────

type WatchlistRow = {
  fund_id: string;
  placed_on_watchlist: string;
  consecutive_quarters: number;
  escalated: boolean;
  escalated_at: string | null;
  notes: string | null;
  vc_portfolio_funds: { fund_name: string; manager_name: string } | { fund_name: string; manager_name: string }[] | null;
};

export async function queryWatchlist(tenantId: string): Promise<WatchlistEntry[]> {
  const db = createAdminClient();

  const { data } = await db
    .from('vc_watchlist')
    .select(
      `
      fund_id, placed_on_watchlist,
      consecutive_quarters, escalated,
      escalated_at, notes,
      vc_portfolio_funds!inner(
        fund_name, manager_name
      )
    `,
    )
    .eq('tenant_id', tenantId)
    .order('consecutive_quarters', { ascending: false });

  if (!data) return [];

  const rows = data as WatchlistRow[];
  const fundIds = rows.map((w) => w.fund_id);
  const { data: assessments } = await db
    .from('vc_quarterly_assessments')
    .select('fund_id, weighted_total_score, category, assessment_date')
    .eq('tenant_id', tenantId)
    .in('fund_id', fundIds)
    .order('assessment_date', { ascending: false });

  const latestAssessment = new Map<string, { weighted_total_score: number | null; category: string | null }>();
  for (const a of assessments ?? []) {
    const fid = a.fund_id as string;
    if (!latestAssessment.has(fid)) {
      latestAssessment.set(fid, {
        weighted_total_score:
          a.weighted_total_score != null ? Number(a.weighted_total_score as number | string) : null,
        category: (a.category as string | null) ?? null,
      });
    }
  }

  return rows.map((w) => {
    const rel = w.vc_portfolio_funds;
    const fund = Array.isArray(rel) ? rel[0] : rel;
    const assessment = latestAssessment.get(w.fund_id);
    return {
      fund_id: w.fund_id,
      fund_name: fund?.fund_name ?? '',
      manager_name: fund?.manager_name ?? '',
      placed_on_watchlist: w.placed_on_watchlist,
      consecutive_quarters: w.consecutive_quarters,
      escalated: w.escalated,
      escalated_at: w.escalated_at,
      notes: w.notes,
      latest_score: assessment?.weighted_total_score ?? null,
      latest_category: assessment?.category ?? null,
    };
  });
}

// ─────────────────────────────────────
// QUERY 7 — Quarterly assessments
// ─────────────────────────────────────

type AssessmentRow = {
  fund_id: string;
  assessment_period: string;
  assessment_date: string;
  weighted_total_score: number | string | null;
  category: string | null;
  status: string;
  financial_performance_score: number | string | null;
  compliance_governance_score: number | string | null;
  ai_summary: string | null;
  vc_portfolio_funds: { fund_name: string } | { fund_name: string }[] | null;
};

export async function queryAssessments(
  tenantId: string,
  status?: string,
  fundId?: string,
): Promise<AssessmentSummary[]> {
  const db = createAdminClient();

  let query = db
    .from('vc_quarterly_assessments')
    .select(
      `
      fund_id, assessment_period,
      assessment_date, weighted_total_score,
      category, status,
      financial_performance_score,
      compliance_governance_score,
      ai_summary,
      vc_portfolio_funds!inner(fund_name)
    `,
    )
    .eq('tenant_id', tenantId)
    .order('assessment_date', { ascending: false });

  if (status) query = query.eq('status', status);
  if (fundId) query = query.eq('fund_id', fundId);

  const { data } = await query;
  if (!data) return [];

  const num = (v: number | string | null | undefined): number | null =>
    v != null && v !== '' ? Number(v) : null;

  return (data as AssessmentRow[]).map((a) => {
    const rel = a.vc_portfolio_funds;
    const fund = Array.isArray(rel) ? rel[0] : rel;
    return {
      fund_id: a.fund_id,
      fund_name: fund?.fund_name ?? '',
      assessment_period: a.assessment_period,
      assessment_date: a.assessment_date,
      weighted_total_score: num(a.weighted_total_score),
      category: a.category,
      status: a.status,
      financial_performance_score: num(a.financial_performance_score),
      compliance_governance_score: num(a.compliance_governance_score),
      ai_summary: a.ai_summary,
    };
  });
}

// ─────────────────────────────────────
// QUERY 8 — Applications pipeline
// ─────────────────────────────────────

type ApplicationRow = {
  id: string;
  fund_name: string;
  manager_name: string;
  status: string;
  submitted_at: string | null;
  total_capital_commitment_usd: number | string;
  geographic_area: string;
  vc_cfps: { title: string } | { title: string }[] | null;
};

export async function queryApplicationsPipeline(tenantId: string, status?: string): Promise<ApplicationSummary[]> {
  const db = createAdminClient();

  let query = db
    .from('vc_fund_applications')
    .select(
      `
      id, fund_name, manager_name, status,
      submitted_at, total_capital_commitment_usd,
      geographic_area,
      vc_cfps(title)
    `,
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false, nullsFirst: false });

  if (status) query = query.eq('status', status);

  const { data } = await query;
  if (!data) return [];

  return (data as ApplicationRow[]).map((a) => {
    const cfp = a.vc_cfps;
    const cfpRow = Array.isArray(cfp) ? cfp[0] : cfp;
    return {
      id: a.id,
      fund_name: a.fund_name,
      manager_name: a.manager_name,
      status: a.status,
      submitted_at: a.submitted_at,
      total_capital_commitment_usd: Number(a.total_capital_commitment_usd),
      geographic_area: a.geographic_area,
      cfp_title: cfpRow?.title ?? null,
    };
  });
}

// ─────────────────────────────────────
// QUERY 9 — Fund managers
// ─────────────────────────────────────

type ManagerRow = {
  id: string;
  name: string;
  firm_name: string;
  email: string | null;
  fund_manager_contacts: Array<{
    full_name: string;
    email: string;
    is_primary: boolean;
    portal_access: boolean;
  }> | null;
};

export async function queryFundManagers(tenantId: string): Promise<FundManagerSummary[]> {
  const db = createAdminClient();

  const { data: managers } = await db
    .from('fund_managers')
    .select(
      `
      id, name, firm_name, email,
      fund_manager_contacts(
        full_name, email, is_primary,
        portal_access
      )
    `,
    )
    .eq('tenant_id', tenantId)
    .order('firm_name');

  if (!managers) return [];

  const { data: funds } = await db
    .from('vc_portfolio_funds')
    .select('fund_manager_id, fund_name')
    .eq('tenant_id', tenantId)
    .not('fund_manager_id', 'is', null);

  const fundsByManager = new Map<string, string[]>();
  for (const f of funds ?? []) {
    const mid = f.fund_manager_id as string;
    const existing = fundsByManager.get(mid) ?? [];
    existing.push(f.fund_name as string);
    fundsByManager.set(mid, existing);
  }

  return (managers as ManagerRow[]).map((m) => {
    const contacts = m.fund_manager_contacts ?? [];
    const primary = contacts.find((c) => c.is_primary);
    const hasPortal = contacts.some((c) => c.portal_access);

    return {
      id: m.id,
      name: m.name,
      firm_name: m.firm_name,
      email: m.email,
      funds: fundsByManager.get(m.id) ?? [],
      primary_contact: primary?.full_name ?? null,
      primary_contact_email: primary?.email ?? null,
      portal_access: hasPortal,
    };
  });
}

// ─────────────────────────────────────
// QUERY 10 — Divestments
// ─────────────────────────────────────

type DivestmentRow = {
  fund_id: string;
  company_name: string;
  divestment_type: string;
  completion_date: string;
  original_investment_amount: number | string;
  proceeds_received: number | string;
  currency: string;
  multiple_on_invested_capital: number | string | null;
  is_full_exit: boolean;
  exit_route: string | null;
  status: string;
  vc_portfolio_funds: { fund_name: string } | { fund_name: string }[] | null;
};

export async function queryDivestments(tenantId: string, fundId?: string): Promise<DivestmentSummary[]> {
  const db = createAdminClient();

  let query = db
    .from('vc_divestments')
    .select(
      `
      fund_id, company_name, divestment_type,
      completion_date, original_investment_amount,
      proceeds_received, currency,
      multiple_on_invested_capital,
      is_full_exit, exit_route, status,
      vc_portfolio_funds!inner(fund_name)
    `,
    )
    .eq('tenant_id', tenantId)
    .order('completion_date', { ascending: false });

  if (fundId) query = query.eq('fund_id', fundId);

  const { data } = await query;
  if (!data) return [];

  return (data as DivestmentRow[]).map((d) => {
    const rel = d.vc_portfolio_funds;
    const fund = Array.isArray(rel) ? rel[0] : rel;
    return {
      fund_id: d.fund_id,
      fund_name: fund?.fund_name ?? '',
      company_name: d.company_name,
      divestment_type: d.divestment_type,
      completion_date: d.completion_date,
      original_investment_amount: Number(d.original_investment_amount),
      proceeds_received: Number(d.proceeds_received),
      currency: d.currency,
      multiple_on_invested_capital: d.multiple_on_invested_capital != null ? Number(d.multiple_on_invested_capital) : null,
      is_full_exit: d.is_full_exit,
      exit_route: d.exit_route,
      status: d.status,
    };
  });
}
