/**
 * Types for PCTU quarterly review report (Vertex-aligned payload + fund JSONB profile).
 */

export type PctuPrincipal = {
  name: string;
  role?: string;
  departed_date?: string | null;
  notes?: string;
};

export type PctuDirector = { name: string };

export type PctuIcMember = { name: string; role?: string };

export type PctuInvestmentCommittee = {
  has_ic: boolean;
  structure_note: string | null;
  members: PctuIcMember[];
};

export type PctuManagementTeamMember = {
  name: string;
  role: string;
  bio: string;
};

/** Stored on `vc_portfolio_funds.pctu_profile` (JSONB, not enforced in DB). */
export type PctuProfile = {
  business_registration: string | null;
  investment_type: string | null;
  principals: PctuPrincipal[];
  directors: PctuDirector[];
  investment_committee: PctuInvestmentCommittee;
  management_team: PctuManagementTeamMember[];
  esg_notes: string[];
};

export type PctuMoney = {
  currency: string;
  amount: number;
};

export type PctuReportHeader = {
  report_title: string;
  period_label: string;
  date_prepared: string;
  fund_name: string;
};

export type PctuReportFundProfile = {
  business_registration: string | null;
  investment_type: string | null;
  principals: Array<{ name: string; role?: string; note?: string }>;
  directors: string[];
  investment_committee: {
    has_ic: boolean;
    structure_note: string | null;
    members: Array<{ name: string; role?: string }>;
  };
};

export type PctuReportFundCapitalAccount = {
  total_commitments: PctuMoney;
  portfolio_drawdowns: PctuMoney;
  fee_drawdowns: PctuMoney;
  management_fees: PctuMoney;
  administrative_fees: PctuMoney;
  other_fund_fees: PctuMoney;
  total_drawdown_inception: PctuMoney;
  remaining_commitment: PctuMoney;
};

export type PctuReportDbjCapitalAccount = {
  total_commitment: PctuMoney;
  total_drawdown: PctuMoney;
  remaining_commitment: PctuMoney;
};

export type PctuReportPortfolioOverview = {
  investment_count: number;
  total_portfolio_investment: PctuMoney;
  divestment_count: number;
  total_divestment_value: PctuMoney | null;
};

export type PctuReportFinancialPerformance = {
  nav: PctuMoney | null;
  nav_per_share: number | null;
  dbj_share: PctuMoney | null;
  dpi: number | null;
  tvpi: number | null;
  calculated_irr: number | null;
  reported_irr: number | null;
};

export type PctuReportUpdatesAndRisk = {
  quarterly_update: string | null;
  fund_management_team_narrative: string | null;
  management_team_table: Array<{ name: string; role: string; bio: string }>;
  fundraising_update: string | null;
  pipeline_development: string | null;
  compliance_matters: string | null;
  impact: string | null;
  outlook: string | null;
};

export type PctuReportAssessmentFooter = {
  weighted_total: number;
  category: string;
  recommendation: string;
  assessed_by: string;
  approved_by: string;
  approved_at: string;
};

/** Narrative-derived fund facts for future template sections (`Unknown` when missing). */
export type PctuReportNarrativeFundMeta = {
  fund_vintage: string;
  fund_size: string;
  first_close: string;
  fund_life_years: string;
  final_close: string;
  year_end: string;
  fund_strategy_summary: string;
};

export type PctuReportNarrativeAllocationRow = { label: string; percentage: string };

export type PctuReportNarrativeAllocations = {
  sectors: PctuReportNarrativeAllocationRow[];
  geographic: PctuReportNarrativeAllocationRow[];
};

export type PctuReportNarrativeLpRow = {
  name: string;
  commitment: string;
  percentage: string;
};

export type PctuReportNarrativePipeline = {
  deal_count: string;
  pipeline_value: string;
  largest_sectors: string;
  term_sheets_issued: string;
  term_sheets_value: string;
};

export type PctuReportNarrativeCapitalAccount = {
  portfolio_drawdowns: string;
  fee_drawdowns: string;
  management_fees: string;
  administrative_fees: string;
  other_fund_fees: string;
};

/** Fully assembled report input for `PctuReportTemplate` / PDF. */
export type PctuReportPayload = {
  header: PctuReportHeader;
  fund_profile: PctuReportFundProfile;
  fund_capital_account: PctuReportFundCapitalAccount;
  dbj_capital_account: PctuReportDbjCapitalAccount;
  portfolio_overview: PctuReportPortfolioOverview;
  fund_financial_performance: PctuReportFinancialPerformance;
  esg_considerations: string[];
  updates_and_risk: PctuReportUpdatesAndRisk;
  assessment_footer: PctuReportAssessmentFooter;
  /** From `vc_fund_narrative_extracts` + `vc_portfolio_funds` fallbacks (not yet rendered in `PctuReportTemplate`). */
  narrative_fund_meta: PctuReportNarrativeFundMeta;
  narrative_allocations: PctuReportNarrativeAllocations;
  narrative_fund_lps: PctuReportNarrativeLpRow[];
  narrative_pipeline: PctuReportNarrativePipeline;
  narrative_capital_account: PctuReportNarrativeCapitalAccount;
};
