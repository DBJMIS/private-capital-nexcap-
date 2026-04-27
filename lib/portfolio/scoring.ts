/**
 * Portfolio performance score (0–100) from Section IV-style inputs.
 * File path: lib/portfolio/scoring.ts
 */

import type { RepaymentStatus } from '@/lib/portfolio/types';

export type Trend = 'improving' | 'stable' | 'declining';

const REPAYMENT_POINTS: Record<RepaymentStatus, number> = {
  current: 40,
  delinquent: 20,
  default: 0,
};

const TREND_POINTS: Record<Trend, number> = {
  improving: 30,
  stable: 20,
  declining: 10,
};

export function repaymentScore(status: RepaymentStatus): number {
  return REPAYMENT_POINTS[status] ?? 0;
}

export function trendScore(trend: Trend | null | undefined): number {
  if (!trend) return 0;
  return TREND_POINTS[trend] ?? 0;
}

export function computePerformanceScore(input: {
  repayment_status: RepaymentStatus;
  revenue_trend: Trend | null;
  valuation_trend: Trend | null;
}): number {
  const r = repaymentScore(input.repayment_status);
  const rv = trendScore(input.revenue_trend ?? undefined);
  const vv = trendScore(input.valuation_trend ?? undefined);
  const total = r + rv + vv;
  return Math.round(total * 100) / 100;
}
