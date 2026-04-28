import { complianceRateByType, summarizeCompliance, type ObligationLite } from '@/lib/portfolio/compliance';

export type FundObligationOverviewObligation = {
  id: string;
  report_type: string;
  period_label: string;
  period_year: number;
  period_month: number;
  due_date: string;
  status: string;
  submitted_date: string | null;
  submitted_by: string | null;
  reviewed_date: string | null;
  document_path: string | null;
  document_name: string | null;
  snapshot_extracted?: boolean;
  snapshot_id?: string | null;
  days_overdue?: number;
};

export type FundObligationOverview = {
  summary: ReturnType<typeof summarizeCompliance>;
  dueSoon: number;
  overdueC: number;
  outC: number;
  acceptedYtd: number;
  recent: FundObligationOverviewObligation[];
  documentRows: FundObligationOverviewObligation[];
  reportingYears: number[];
  compliancePctByType: {
    quarterly_financial: number;
    quarterly_investment_mgmt: number;
    audited_annual: number;
    inhouse_quarterly: number;
  };
};

function toLite(rows: FundObligationOverviewObligation[]): ObligationLite[] {
  return rows.map((r) => ({ report_type: r.report_type, status: r.status, due_date: r.due_date }));
}

/** Same metrics as FundDetailClient overview + scorecard + documents list (server-only full row set). */
export function computeFundObligationOverview(rows: FundObligationOverviewObligation[]): FundObligationOverview {
  const lite = toLite(rows);
  const summary = summarizeCompliance(lite);
  const yNow = new Date().getFullYear();

  const dueSoon = rows.filter((r) => r.status === 'due').length;
  const overdueC = rows.filter((r) => r.status === 'overdue').length;
  const outC = rows.filter((r) => r.status === 'outstanding').length;
  const acceptedYtd = rows.filter((r) => r.status === 'accepted' && r.period_year === yNow).length;

  const recent = [...rows].sort((a, b) => (a.due_date < b.due_date ? 1 : -1)).slice(0, 8);

  const ys = new Set<number>();
  rows.forEach((r) => ys.add(r.period_year));
  const reportingYears = [...ys].sort((a, b) => b - a);
  if (reportingYears.length === 0) {
    for (let y = yNow + 1; y >= yNow - 4; y -= 1) reportingYears.push(y);
  }

  const documentRows = rows.filter((r) => r.document_path);

  const compliancePctByType = {
    quarterly_financial: complianceRateByType(lite, 'quarterly_financial'),
    quarterly_investment_mgmt: complianceRateByType(lite, 'quarterly_investment_mgmt'),
    audited_annual: complianceRateByType(lite, 'audited_annual'),
    inhouse_quarterly: complianceRateByType(lite, 'inhouse_quarterly'),
  };

  return {
    summary,
    dueSoon,
    overdueC,
    outC,
    acceptedYtd,
    recent,
    documentRows,
    reportingYears,
    compliancePctByType,
  };
}
