/**
 * Portfolio / reporting types used by the reporting engine and API routes.
 */

import type { Json, VcFundNarrativeExtract, VcQuarterlyAssessment, VcWatchlistEntry } from '@/types/database';

export type PortfolioReportType =
  | 'quarterly_financial'
  | 'quarterly_investment_mgmt'
  | 'audited_annual'
  | 'inhouse_quarterly';

export type PortfolioFundRow = {
  id: string;
  tenant_id: string;
  application_id: string | null;
  commitment_id: string | null;
  fund_name: string;
  manager_name: string;
  fund_manager_id?: string | null;
  fund_representative: string | null;
  manager_email: string | null;
  manager_phone: string | null;
  currency: string;
  total_fund_commitment: number;
  dbj_commitment: number;
  dbj_pro_rata_pct: number;
  listed: boolean;
  fund_status: string;
  year_end_month: number;
  quarterly_report_due_days: number;
  audit_report_due_days: number;
  requires_quarterly_financial: boolean;
  requires_quarterly_inv_mgmt: boolean;
  requires_audited_annual: boolean;
  requires_inhouse_quarterly: boolean;
  report_months: number[];
  audit_month: number;
  exchange_rate_jmd_usd: number | null;
  commitment_date: string;
  fund_close_date: string | null;
  fund_life_years: number | null;
  investment_period_years: number | null;
  contacts: unknown;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  fund_category?: string | null;
  fund_end_date?: string | null;
  is_pvc?: boolean | null;
  management_fee_pct?: number | null;
  performance_fee_pct?: number | null;
  hurdle_rate_pct?: number | null;
  target_irr_pct?: number | null;
  sector_focus?: string[] | null;
  impact_objectives?: number[] | null;
  /** PCTU quarterly report fund profile (JSONB). */
  pctu_profile?: Json | null;
  fund_size_status?: string | null;
  fund_close_lp_count?: number | null;
  fund_close_date_actual?: string | null;
};

export type ReportingObligationInsert = {
  tenant_id: string;
  fund_id: string;
  report_type: PortfolioReportType;
  period_year: number;
  period_month: number;
  period_label: string;
  due_date: string;
  status: string;
};

/** SME portfolio monitoring (legacy dashboard). */
export type RepaymentStatus = 'current' | 'delinquent' | 'default';

export type PerformanceBand = 'performing' | 'watch' | 'underperforming' | 'critical';

export type AlertFlag = 'Critical' | 'Underperforming';

/** Optional server-enriched fields for fund monitoring (Epic 12). */
export type PortfolioFundMonitorMetrics = {
  dpi: number | null;
  tvpi: number | null;
};

export type PortfolioFundRowWithMonitorMetrics = PortfolioFundRow & PortfolioFundMonitorMetrics;

export type {
  ExtractionConfidenceLevel,
  SnapshotExtractionConfidence,
  SnapshotExtractedFields,
} from '@/lib/portfolio/snapshot-extraction';

/** Epic 13 quarterly assessment dimension keys (must match DB / API field names). */
export type DimensionKey =
  | 'financial_performance'
  | 'development_impact'
  | 'fund_management'
  | 'compliance_governance'
  | 'portfolio_health';

/** Client → API payload for creating/updating a quarterly assessment draft. */
export type AssessmentFormValues = {
  assessment_period: string;
  assessment_date: string;
  financial_performance_score: number | null;
  development_impact_score: number | null;
  fund_management_score: number | null;
  compliance_governance_score: number | null;
  portfolio_health_score: number | null;
  financial_commentary: string;
  impact_commentary: string;
  management_commentary: string;
  compliance_commentary: string;
  portfolio_commentary: string;
  overall_summary: string;
  contractual_obligation?: boolean;
  status?: 'draft' | 'submitted';
};

/** Watchlist row joined for UI (Epic 13). */
export type WatchlistFundRow = {
  watchlist: VcWatchlistEntry;
  fund_name: string;
  currency: string;
  is_pvc: boolean | null;
  last_weighted_total_score: number | null;
  last_category: string | null;
  last_divestment_recommendation: string | null;
  last_assessment_period: string | null;
};

export type DimensionFactor = {
  label: string;
  value: string;
  adjustment: number;
  detail: string;
};

export type DimensionReasoning = {
  factors: DimensionFactor[];
  base_score: number;
  final_score: number;
  clamped: boolean;
};

export type DimensionOverride = {
  score: number;
  reason: string;
};

export type NarrativeExtract = VcFundNarrativeExtract;

export type AssessmentWithDerivation = VcQuarterlyAssessment & {
  reasoning_by_dimension: Partial<Record<DimensionKey, DimensionReasoning>>;
  overrides_by_dimension: Partial<Record<DimensionKey, DimensionOverride>>;
  narrative_extract: VcFundNarrativeExtract | null;
};

export type DivestmentSummaryRow = {
  fund_id: string;
  fund_name: string;
  currency: string;
  fund_category: string | null;
  commitment_year: number | null;
  assessment_id: string;
  assessment_period: string;
  assessment_date: string;
  approved_at: string | null;
  investment_stage: 'fully_invested' | 'partially_invested' | 'not_yet_deployed' | null;
  financial_performance_score: number | null;
  development_impact_score: number | null;
  dd_outcome_at_commitment: string | null;
  contractual_obligation: boolean;
  divestment_recommendation: string | null;
  weighted_total_score: number | null;
  category: string | null;
  ai_summary: string | null;
  fund_lifecycle_stage: string;
  dd_assessment_id: string | null;
  dd_reference: {
    recommendation: string | null;
    score: number | null;
    completed_at: string | null;
  } | null;
};
