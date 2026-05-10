import type { SupabaseClient } from '@supabase/supabase-js';

import { snapshotPeriodLabel } from '@/lib/portal/format-helpers';
import type { PortalDashboardFundEntry } from '@/types/portal-dashboard';

type ObligationRow = {
  report_type: string;
  due_date: string;
  period_label: string;
  status: string;
  days_overdue: number;
};

type CapitalCallRow = {
  id: string;
  call_amount: number;
  currency: string;
  due_date: string | null;
  date_of_notice: string;
  status: string;
  date_paid: string | null;
};

type SnapshotRow = {
  nav: number | null;
  reported_irr: number | null;
  committed_capital: number | null;
  period_year: number;
  period_quarter: number | null;
};

export type PortalFundWorkspacePortfolioMetrics = Pick<
  PortalDashboardFundEntry,
  'obligations' | 'obligations_summary' | 'capital_calls' | 'latest_snapshot'
>;

/**
 * Loads obligations, capital calls, and latest snapshot for a portfolio fund
 * using the same rules as `app/api/portal/funds/[id]/route.ts` (fund workspace).
 */
export async function loadPortalFundWorkspacePortfolioMetrics(
  adminClient: SupabaseClient,
  tenantId: string,
  portfolioFundId: string,
  capitalCallsLimit: number,
): Promise<{ ok: true; metrics: PortalFundWorkspacePortfolioMetrics } | { ok: false; error: unknown }> {
  const { data: obRows, error: obErr } = await adminClient
    .from('vc_reporting_obligations')
    .select('report_type, due_date, period_label, status, days_overdue')
    .eq('tenant_id', tenantId)
    .eq('fund_id', portfolioFundId)
    .order('due_date', { ascending: true });
  if (obErr) return { ok: false, error: obErr };

  const list = (obRows ?? []) as ObligationRow[];
  const today = new Date().toISOString().slice(0, 10);
  const nextDue = list.find((o) => o.status !== 'submitted' && o.due_date.slice(0, 10) >= today) ?? null;
  const overdueCount = list.filter((o) => o.status === 'overdue').length;
  const pendingCount = list.filter((o) => o.status === 'pending' || o.status === 'due').length;
  const acceptedCount = list.filter((o) => o.status === 'accepted').length;

  const obligations_summary: PortalFundWorkspacePortfolioMetrics['obligations_summary'] = {
    overdue: overdueCount,
    pending: pendingCount,
    accepted: acceptedCount,
    total: list.length,
  };

  const obligations: PortalFundWorkspacePortfolioMetrics['obligations'] = {
    overdue_count: overdueCount,
    pending_count: pendingCount,
    next_due: nextDue
      ? {
          report_type: nextDue.report_type,
          due_date: nextDue.due_date,
          period_label: nextDue.period_label,
          status: nextDue.status,
          days_overdue: nextDue.days_overdue,
        }
      : null,
  };

  const { data: ccRows, error: ccErr } = await adminClient
    .from('vc_capital_calls')
    .select('id, call_amount, currency, due_date, date_of_notice, status, date_paid')
    .eq('tenant_id', tenantId)
    .eq('fund_id', portfolioFundId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(capitalCallsLimit);
  if (ccErr) return { ok: false, error: ccErr };

  const capital_calls = (ccRows ?? []) as CapitalCallRow[];

  const { data: snapRow, error: snapErr } = await adminClient
    .from('vc_fund_snapshots')
    .select('nav, reported_irr, committed_capital, period_year, period_quarter')
    .eq('tenant_id', tenantId)
    .eq('fund_id', portfolioFundId)
    .order('period_year', { ascending: false })
    .order('period_quarter', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (snapErr) return { ok: false, error: snapErr };

  let latest_snapshot: PortalFundWorkspacePortfolioMetrics['latest_snapshot'] = null;
  if (snapRow) {
    const s = snapRow as SnapshotRow;
    latest_snapshot = {
      nav: s.nav,
      reported_irr: s.reported_irr,
      committed_capital: s.committed_capital,
      period_year: s.period_year,
      period_quarter: s.period_quarter,
      period_label: snapshotPeriodLabel(null, s.period_year, s.period_quarter),
    };
  }

  return {
    ok: true,
    metrics: {
      obligations,
      obligations_summary,
      capital_calls,
      latest_snapshot,
    },
  };
}

const DASHBOARD_TERMINAL_OBLIGATION_STATUSES = new Set(['submitted', 'accepted', 'waived']);

export type PortalDashboardPortfolioMetrics = Pick<
  PortalDashboardFundEntry,
  'obligations' | 'obligations_summary' | 'capital_calls' | 'latest_snapshot'
>;

/** Same obligation / snapshot rules as `app/api/portal/dashboard/route.ts` (fund cards). */
export async function loadPortalDashboardPortfolioMetrics(
  adminClient: SupabaseClient,
  tenantId: string,
  portfolioFundId: string,
  capitalCallsLimit: number,
): Promise<{ ok: true; metrics: PortalDashboardPortfolioMetrics } | { ok: false; error: unknown }> {
  const { data: obRows, error: obErr } = await adminClient
    .from('vc_reporting_obligations')
    .select('report_type, due_date, period_label, status, days_overdue')
    .eq('tenant_id', tenantId)
    .eq('fund_id', portfolioFundId)
    .order('due_date', { ascending: true });
  if (obErr) return { ok: false, error: obErr };

  const obligationsList = (obRows ?? []) as ObligationRow[];
  const today = new Date().toISOString().slice(0, 10);
  const overdue_count = obligationsList.filter(
    (o) => o.status === 'overdue' || (typeof o.days_overdue === 'number' && o.days_overdue > 0),
  ).length;
  const pending_count = obligationsList.filter((o) => {
    const terminal = DASHBOARD_TERMINAL_OBLIGATION_STATUSES.has(o.status);
    const overdue = o.status === 'overdue' || (typeof o.days_overdue === 'number' && o.days_overdue > 0);
    return !terminal && !overdue && ['pending', 'due', 'outstanding', 'under_review'].includes(o.status);
  }).length;
  const next_due =
    obligationsList.find((o) => {
      if (DASHBOARD_TERMINAL_OBLIGATION_STATUSES.has(o.status)) return false;
      return o.due_date.slice(0, 10) >= today;
    }) ?? null;

  const obligations: PortalDashboardPortfolioMetrics['obligations'] = {
    overdue_count,
    pending_count,
    next_due: next_due
      ? {
          report_type: next_due.report_type,
          due_date: next_due.due_date,
          period_label: next_due.period_label,
          status: next_due.status,
          days_overdue: next_due.days_overdue,
        }
      : null,
  };

  const overdueObligations = obligationsList.filter(
    (o) => o.status === 'overdue' || (typeof o.days_overdue === 'number' && o.days_overdue > 0),
  );
  const pendingObligations = obligationsList.filter((o) => o.status === 'pending' || o.status === 'due');
  const acceptedObligations = obligationsList.filter((o) => o.status === 'accepted');
  const obligations_summary: PortalDashboardPortfolioMetrics['obligations_summary'] = {
    overdue: overdueObligations.length,
    pending: pendingObligations.length,
    accepted: acceptedObligations.length,
    total: obligationsList.length,
  };

  const { data: ccRows, error: ccErr } = await adminClient
    .from('vc_capital_calls')
    .select('id, call_amount, currency, due_date, date_of_notice, status, date_paid')
    .eq('tenant_id', tenantId)
    .eq('fund_id', portfolioFundId)
    .order('due_date', { ascending: false, nullsFirst: false })
    .limit(capitalCallsLimit);
  if (ccErr) return { ok: false, error: ccErr };

  const capital_calls = (ccRows ?? []) as CapitalCallRow[];

  const { data: snapRow, error: snapErr } = await adminClient
    .from('vc_fund_snapshots')
    .select('nav, reported_irr, committed_capital, period_year, period_quarter')
    .eq('tenant_id', tenantId)
    .eq('fund_id', portfolioFundId)
    .order('period_year', { ascending: false })
    .order('period_quarter', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (snapErr) return { ok: false, error: snapErr };

  let latest_snapshot: PortalDashboardPortfolioMetrics['latest_snapshot'] = null;
  if (snapRow) {
    const s = snapRow as SnapshotRow;
    latest_snapshot = {
      nav: s.nav,
      reported_irr: s.reported_irr,
      committed_capital: s.committed_capital,
      period_year: s.period_year,
      period_quarter: s.period_quarter,
      period_label: snapshotPeriodLabel(null, s.period_year, s.period_quarter),
    };
  }

  return {
    ok: true,
    metrics: {
      obligations,
      obligations_summary,
      capital_calls,
      latest_snapshot,
    },
  };
}
