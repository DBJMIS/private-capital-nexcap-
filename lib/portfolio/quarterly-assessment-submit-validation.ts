import 'server-only';

import type { DimensionKey } from '@/lib/portfolio/types';
import type { VcQuarterlyAssessment } from '@/types/database';

export const QUARTERLY_ASSESSMENT_DIMENSION_KEYS: DimensionKey[] = [
  'financial_performance',
  'development_impact',
  'fund_management',
  'compliance_governance',
  'portfolio_health',
];

export function quarterlyAssessmentScoreField(k: DimensionKey): keyof VcQuarterlyAssessment {
  const map: Record<DimensionKey, keyof VcQuarterlyAssessment> = {
    financial_performance: 'financial_performance_score',
    development_impact: 'development_impact_score',
    fund_management: 'fund_management_score',
    compliance_governance: 'compliance_governance_score',
    portfolio_health: 'portfolio_health_score',
  };
  return map[k];
}

export function readQuarterlyAssessmentScore(row: VcQuarterlyAssessment, k: DimensionKey): number | null {
  const v = row[quarterlyAssessmentScoreField(k)];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** All dimensions scored and non-empty AI summary (same rules as finalize / submit). */
export function validateQuarterlyAssessmentSubmitReady(row: VcQuarterlyAssessment): string | null {
  for (const d of QUARTERLY_ASSESSMENT_DIMENSION_KEYS) {
    const s = readQuarterlyAssessmentScore(row, d);
    if (s == null) return `Missing score: ${d}`;
  }
  if (!row.ai_summary?.trim()) return 'AI summary is required before submit.';
  return null;
}
