/** Slice of `vc_fund_applications` exposed on the portal dashboard / fund workspace. */
export type PortalDashboardApplicationSlice = {
  id: string;
  fund_name: string;
  manager_name: string;
  status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

/** Slice of `vc_portfolio_funds` exposed on the portal dashboard / fund workspace. */
export type PortalDashboardPortfolioFundSlice = {
  id: string;
  fund_name: string;
  fund_status: string;
  dbj_commitment: number | null;
  currency: string;
  /** From `vc_portfolio_funds.manager_name` when available (Path C / legacy funds). */
  manager_name?: string;
  /** From `vc_portfolio_funds.commitment_date` when available (Path C). */
  commitment_date?: string | null;
};

export type PortalDashboardFundEntry = {
  /** Null for Path C (portfolio-only funds with no `vc_fund_applications` row). */
  application: PortalDashboardApplicationSlice | null;
  cfp: {
    title: string;
    status: string;
    closing_date: string | null;
  } | null;
  questionnaire: {
    id: string;
    status: string;
    completed_sections: number;
    total_sections: number;
    all_complete: boolean;
    started_at: string | null;
    completed_at: string | null;
  } | null;
  portfolio_fund: PortalDashboardPortfolioFundSlice | null;
  obligations: {
    overdue_count: number;
    pending_count: number;
    next_due: {
      report_type: string;
      due_date: string;
      period_label: string;
      status: string;
      days_overdue: number;
    } | null;
  } | null;
  obligations_summary: {
    overdue: number;
    pending: number;
    accepted: number;
    total: number;
  } | null;
  capital_calls: Array<{
    id: string;
    call_amount: number;
    currency: string;
    due_date: string | null;
    date_of_notice: string;
    status: string;
    date_paid: string | null;
  }>;
  latest_snapshot: {
    nav: number | null;
    reported_irr: number | null;
    committed_capital: number | null;
    period_year: number;
    period_quarter: number | null;
    period_label: string | null;
  } | null;
  stage: 'onboarding' | 'portfolio';
  /** True when this row is backed only by `vc_portfolio_funds` (no application). */
  is_direct_portfolio?: boolean;
  /** Same as `portfolio_fund.id` when `is_direct_portfolio`; used for routing. */
  portfolio_fund_id?: string;
};

export type PortalDashboardResponse =
  | {
      state: 'no_application';
      funds: [];
    }
  | {
      state: 'active';
      funds: PortalDashboardFundEntry[];
    };
