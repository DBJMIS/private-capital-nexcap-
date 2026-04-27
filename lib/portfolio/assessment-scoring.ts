import { complianceRateByType, type ObligationLite } from '@/lib/portfolio/compliance';
import type { DimensionKey, PortfolioReportType } from '@/lib/portfolio/types';
import type { VcAssessmentConfig } from '@/types/database';

const DIMENSION_KEYS: DimensionKey[] = [
  'financial_performance',
  'development_impact',
  'fund_management',
  'compliance_governance',
  'portfolio_health',
];

const REPORT_TYPES: PortfolioReportType[] = [
  'quarterly_financial',
  'quarterly_investment_mgmt',
  'audited_annual',
  'inhouse_quarterly',
];

function yearsBetween(commitmentDate: string, assessmentDate: string): number {
  const a = new Date(`${commitmentDate}T12:00:00`);
  const b = new Date(`${assessmentDate}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const ms = b.getTime() - a.getTime();
  return ms / (365.25 * 86400000);
}

export function deriveFundLifecycleStage(
  commitmentDate: string,
  assessmentDate: string,
  isPvc: boolean,
): 'early' | 'mid' | 'late' {
  if (isPvc) return 'mid';
  const y = yearsBetween(commitmentDate, assessmentDate);
  if (y < 3) return 'early';
  if (y < 6) return 'mid';
  return 'late';
}

function baseWeightsFromConfig(config: VcAssessmentConfig): Record<DimensionKey, number> {
  return {
    financial_performance: Number(config.weight_financial_performance),
    development_impact: Number(config.weight_development_impact),
    fund_management: Number(config.weight_fund_management),
    compliance_governance: Number(config.weight_compliance_governance),
    portfolio_health: Number(config.weight_portfolio_health),
  };
}

export function computeEffectiveWeights(
  config: VcAssessmentConfig,
  stage: 'early' | 'mid' | 'late',
): Record<DimensionKey, number> {
  const w = baseWeightsFromConfig(config);
  if (stage === 'early') {
    w.financial_performance += Number(config.lifecycle_early_financial_adj);
    w.fund_management += Number(config.lifecycle_early_management_adj);
  } else if (stage === 'late') {
    w.financial_performance += Number(config.lifecycle_late_financial_adj);
    w.development_impact += Number(config.lifecycle_late_impact_adj);
  }
  let sum = DIMENSION_KEYS.reduce((s, k) => s + w[k], 0);
  if (sum <= 0) {
    const even = 100 / DIMENSION_KEYS.length;
    for (const k of DIMENSION_KEYS) w[k] = even;
    return w;
  }
  const scale = 100 / sum;
  for (const k of DIMENSION_KEYS) {
    w[k] = Math.round(w[k] * scale * 100) / 100;
  }
  sum = DIMENSION_KEYS.reduce((s, k) => s + w[k], 0);
  const drift = Math.round((100 - sum) * 100) / 100;
  if (drift !== 0) {
    w.financial_performance = Math.round((w.financial_performance + drift) * 100) / 100;
  }
  return w;
}

export function computeWeightedScore(
  scores: Partial<Record<DimensionKey, number>>,
  weights: Record<DimensionKey, number>,
): number | null {
  let total = 0;
  for (const k of DIMENSION_KEYS) {
    const s = scores[k];
    if (s == null || Number.isNaN(s)) return null;
    total += s * (weights[k] / 100);
  }
  return Math.round(total * 100) / 100;
}

export function deriveCategory(
  score: number,
  config: VcAssessmentConfig,
): 'strong' | 'adequate' | 'watchlist' | 'divest' {
  const strong = Number(config.threshold_strong);
  const adequate = Number(config.threshold_adequate);
  const watch = Number(config.threshold_watchlist);
  if (score >= strong) return 'strong';
  if (score >= adequate) return 'adequate';
  if (score >= watch) return 'watchlist';
  return 'divest';
}

export function deriveRecommendation(
  category: ReturnType<typeof deriveCategory>,
  contractualObligation: boolean,
): 'hold' | 'monitor' | 'watchlist' | 'freeze' | 'divest' {
  if (category === 'divest' && contractualObligation) return 'freeze';
  if (category === 'strong') return 'hold';
  if (category === 'adequate') return 'monitor';
  if (category === 'watchlist') return 'watchlist';
  return 'divest';
}

export function deriveComplianceScore(obligations: ObligationLite[]): number {
  const rates: number[] = [];
  for (const rt of REPORT_TYPES) {
    rates.push(complianceRateByType(obligations, rt));
  }
  if (rates.length === 0) return 0;
  const sum = rates.reduce((a, b) => a + b, 0);
  return Math.round((sum / rates.length) * 100) / 100;
}
