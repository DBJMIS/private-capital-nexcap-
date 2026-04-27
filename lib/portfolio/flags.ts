/**
 * Alert flags and performance bands for portfolio monitoring.
 * File path: lib/portfolio/flags.ts
 */

import type { PerformanceBand, RepaymentStatus, AlertFlag } from '@/lib/portfolio/types';
import type { Trend } from '@/lib/portfolio/scoring';
import { computePerformanceScore } from '@/lib/portfolio/scoring';

/** Flags stored on snapshot at save time (server). */
export function computeSnapshotAlertFlags(input: {
  performance_score: number | null;
  repayment_status: RepaymentStatus;
}): AlertFlag[] {
  const flags: AlertFlag[] = [];
  if (input.repayment_status === 'default') {
    flags.push('Critical');
  }
  if (input.performance_score != null && input.performance_score < 50) {
    flags.push('Underperforming');
  }
  return flags;
}

/**
 * UI band for badges (green / yellow / orange / red).
 * Critical (default) > Underperforming (score) > Reporting overdue > Watch > Performing
 */
export function derivePerformanceBand(input: {
  performance_score: number | null;
  repayment_status: RepaymentStatus | null;
  reporting_overdue: boolean;
}): PerformanceBand {
  if (input.repayment_status === 'default') {
    return 'critical';
  }
  const score = input.performance_score;
  if (score == null) {
    return input.reporting_overdue ? 'watch' : 'watch';
  }
  if (score < 50) {
    return 'underperforming';
  }
  if (input.reporting_overdue) {
    return 'watch';
  }
  if (score < 70) {
    return 'watch';
  }
  return 'performing';
}

export function isReportingOverdue(lastSnapshotDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastSnapshotDate) return true;
  const d = new Date(lastSnapshotDate);
  if (Number.isNaN(d.getTime())) return true;
  const diff = now.getTime() - d.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  return days > 90;
}

/** Aggregate alert labels for an investment (snapshot flags + overdue). */
export function buildInvestmentAlertLabels(input: {
  snapshot_flags: AlertFlag[];
  reporting_overdue: boolean;
}): string[] {
  const set = new Set<string>(input.snapshot_flags);
  if (input.reporting_overdue) set.add('Reporting Overdue');
  return [...set];
}

export function scoreFromInputs(input: {
  repayment_status: RepaymentStatus;
  revenue_trend: Trend | null;
  valuation_trend: Trend | null;
}): number {
  return computePerformanceScore({
    repayment_status: input.repayment_status,
    revenue_trend: input.revenue_trend,
    valuation_trend: input.valuation_trend,
  });
}
