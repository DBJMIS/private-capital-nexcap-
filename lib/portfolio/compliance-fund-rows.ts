import type { SupabaseClient } from '@supabase/supabase-js';

export const COMPLIANCE_FUND_BASE_SELECT = `
    id,
    fund_name,
    manager_name,
    fund_status,
    currency,
    listed,
    dbj_commitment,
    fund_category,
    fund_end_date,
    is_pvc,
    management_fee_pct,
    performance_fee_pct,
    hurdle_rate_pct,
    target_irr_pct,
    sector_focus,
    impact_objectives
  `;

export const COMPLIANCE_OBLIGATION_DETAIL_SELECT = `
      id,
      status,
      report_type,
      due_date,
      period_label,
      period_year,
      period_month,
      days_overdue,
      reminder_sent_at,
      reminder_sent_to,
      escalated_at,
      escalated_to,
      escalation_level
    `;

/** @deprecated Prefer COMPLIANCE_FUND_BASE_SELECT + obligation merge + RPC for summary rows. */
export const COMPLIANCE_FUNDS_NESTED_SELECT = `
    ${COMPLIANCE_FUND_BASE_SELECT.trim()},
    vc_reporting_obligations (
      ${COMPLIANCE_OBLIGATION_DETAIL_SELECT.trim().replace(/\s+/g, ' ')}
    )
  `;

export type ComplianceFundWithObligations = NestedFund;

export type ComplianceSummaryRow = {
  fund_id: string;
  fund_name: string;
  manager_name: string;
  currency: string;
  listed: boolean;
  dbj_commitment: number;
  total_obligations: number;
  submitted: number;
  accepted: number;
  outstanding: number;
  overdue: number;
  audits_outstanding: number;
  compliance_status: string;
};

export type ComplianceNestedObligation = {
  id: string;
  status: string;
  report_type: string;
  due_date: string;
  period_label: string;
  period_year: number;
  period_month: number;
  days_overdue: number;
  reminder_sent_at: string | null;
  reminder_sent_to: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
  escalation_level: string | null;
};

/** Minimal fields used by `deriveComplianceStatus` (call sites may pass lites). */
export type ComplianceObligationStatusSlice = Pick<ComplianceNestedObligation, 'due_date' | 'status' | 'report_type'>;

type NestedObligation = ComplianceNestedObligation;

type NestedFund = {
  id: string;
  fund_name: string;
  manager_name: string;
  fund_status: string;
  currency: string;
  listed: boolean;
  dbj_commitment: number;
  fund_category?: string | null;
  fund_end_date?: string | null;
  is_pvc?: boolean | null;
  management_fee_pct?: number | null;
  performance_fee_pct?: number | null;
  hurdle_rate_pct?: number | null;
  target_irr_pct?: number | null;
  sector_focus?: string[] | null;
  impact_objectives?: number[] | null;
  vc_reporting_obligations: NestedObligation[] | null;
};

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0]!;
}

/** Compliance status from obligations; only obligations at or past due_date affect status. */
export function deriveComplianceStatus(obligations: ComplianceObligationStatusSlice[]): string {
  const today = todayIsoDate();

  const pastDue = obligations.filter((o) => o.due_date <= today);

  const overdueObs = pastDue.filter((o) => o.status === 'overdue' || o.status === 'outstanding');

  const auditOverdue = overdueObs.filter((o) => o.report_type === 'audited_annual');

  const nonAuditOverdue = overdueObs.filter((o) => o.report_type !== 'audited_annual');

  if (pastDue.length === 0) return 'no_data';

  if (auditOverdue.length > 0) return 'audits_outstanding';

  if (nonAuditOverdue.length > 0) return 'reports_outstanding';

  const allClear = pastDue.every((o) => o.status === 'accepted' || o.status === 'submitted');
  if (allClear) return 'fully_compliant';

  return 'partially_compliant';
}

type RpcComplianceSummaryRow = {
  fund_id: string;
  fund_name: string;
  manager_name: string;
  currency: string;
  listed: boolean;
  dbj_commitment: string | number | null;
  fund_category: string | null;
  fund_status: string;
  total_obligations: string | number | null;
  submitted: string | number | null;
  accepted: string | number | null;
  outstanding: string | number | null;
  overdue: string | number | null;
  audits_outstanding: string | number | null;
  compliance_status: string;
};

function mapRpcToComplianceSummaryRows(data: RpcComplianceSummaryRow[] | null): ComplianceSummaryRow[] {
  return (data ?? []).map((r) => ({
    fund_id: r.fund_id,
    fund_name: r.fund_name,
    manager_name: r.manager_name ?? '',
    currency: r.currency,
    listed: Boolean(r.listed),
    dbj_commitment: Number(r.dbj_commitment ?? 0),
    total_obligations: Number(r.total_obligations ?? 0),
    submitted: Number(r.submitted ?? 0),
    accepted: Number(r.accepted ?? 0),
    outstanding: Number(r.outstanding ?? 0),
    overdue: Number(r.overdue ?? 0),
    audits_outstanding: Number(r.audits_outstanding ?? 0),
    compliance_status: r.compliance_status,
  }));
}

export function mapNestedFundsToComplianceRows(funds: unknown[] | null): ComplianceSummaryRow[] {
  const today = todayIsoDate();

  return (funds ?? []).map((fund) => {
    const f = fund as NestedFund;
    const obs = f.vc_reporting_obligations ?? [];
    const total_obligations = obs.length;
    const pastObs = obs.filter((o) => o.due_date <= today);

    const accepted = pastObs.filter((o) => o.status === 'accepted').length;
    const submitted = pastObs.filter((o) => o.status === 'submitted').length;
    const outstanding = pastObs.filter((o) => ['outstanding', 'overdue'].includes(o.status)).length;
    const overdue = pastObs.filter((o) => o.status === 'overdue').length;
    const audits_outstanding = pastObs.filter(
      (o) => o.report_type === 'audited_annual' && ['outstanding', 'overdue'].includes(o.status),
    ).length;

    const compliance_status = deriveComplianceStatus(obs);

    return {
      fund_id: f.id,
      fund_name: f.fund_name,
      manager_name: f.manager_name ?? '',
      currency: f.currency,
      listed: f.listed,
      dbj_commitment: Number(f.dbj_commitment),
      total_obligations,
      submitted,
      accepted,
      outstanding,
      overdue,
      audits_outstanding,
      compliance_status,
    };
  });
}

const COMPLIANCE_OBLIGATION_SELECT =
  'fund_id, id, status, report_type, due_date, period_label, period_year, period_month, days_overdue, reminder_sent_at, reminder_sent_to, escalated_at, escalated_to, escalation_level';

async function loadFundsWithObligationDetails(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ funds: NestedFund[] | null; error: string | null }> {
  const { data: fundRows, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select(COMPLIANCE_FUND_BASE_SELECT)
    .eq('tenant_id', tenantId)
    .eq('fund_status', 'active')
    .order('fund_name');

  if (fErr) {
    return { funds: null, error: fErr.message };
  }
  if (!fundRows?.length) {
    return { funds: [], error: null };
  }

  const ids = (fundRows as { id: string }[]).map((f) => f.id);
  const { data: obRows, error: oErr } = await supabase
    .from('vc_reporting_obligations')
    .select(COMPLIANCE_OBLIGATION_SELECT)
    .eq('tenant_id', tenantId)
    .in('fund_id', ids);

  if (oErr) {
    return { funds: null, error: oErr.message };
  }

  const byFund = new Map<string, NestedObligation[]>();
  for (const raw of obRows ?? []) {
    const o = raw as NestedObligation & { fund_id: string };
    const fid = o.fund_id;
    const { fund_id: _fid, ...rest } = o;
    const list = byFund.get(fid) ?? [];
    list.push(rest as NestedObligation);
    byFund.set(fid, list);
  }

  const funds: NestedFund[] = (fundRows as NestedFund[]).map((f) => ({
    ...f,
    vc_reporting_obligations: byFund.get(f.id) ?? [],
  }));

  return { funds, error: null };
}

export async function loadComplianceFundRows(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ funds: unknown[] | null; rows: ComplianceSummaryRow[]; error: string | null }> {
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_compliance_summary', {
    p_tenant_id: tenantId,
  });

  if (rpcErr) {
    return { funds: null, rows: [], error: rpcErr.message };
  }

  const rows = mapRpcToComplianceSummaryRows((rpcData ?? []) as RpcComplianceSummaryRow[]);

  const { funds, error: mergeErr } = await loadFundsWithObligationDetails(supabase, tenantId);
  if (mergeErr) {
    return { funds: null, rows, error: mergeErr };
  }

  return { funds: funds as unknown[], rows, error: null };
}
