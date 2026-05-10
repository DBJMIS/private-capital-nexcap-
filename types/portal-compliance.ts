export type PortalComplianceObligationDto = {
  id: string;
  report_type: string;
  period_label: string;
  period_year: number;
  period_month: number | null;
  due_date: string;
  status: string;
  days_overdue: number;
  submitted_date: string | null;
  review_notes: string | null;
  document_url: string | null;
};

export type PortalComplianceSummaryDto = {
  total: number;
  overdue: number;
  due_soon: number;
  submitted: number;
  accepted: number;
  upcoming: number;
};

export type PortalComplianceResponse = {
  portfolio_fund: { id: string; fund_name: string } | null;
  summary: PortalComplianceSummaryDto | null;
  obligations: PortalComplianceObligationDto[];
};
