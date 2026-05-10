export type PortalReportingObligationDto = {
  id: string;
  report_type: string;
  period_label: string;
  period_year: number;
  due_date: string;
  status: string;
  days_overdue: number;
  submitted_date: string | null;
  submitted_by: string | null;
  document_url: string | null;
  review_notes: string | null;
};

export type PortalReportingListResponse = {
  obligations: PortalReportingObligationDto[];
  portfolio_fund: { id: string; fund_name: string } | null;
};
