/**
 * Shared helpers for portfolio API routes.
 * File path: lib/portfolio/queries.ts
 */

import type { RepaymentStatus } from '@/lib/portfolio/types';
import {
  buildInvestmentAlertLabels,
  computeSnapshotAlertFlags,
  derivePerformanceBand,
  isReportingOverdue,
} from '@/lib/portfolio/flags';

export function sectorFromApplication(app: { onboarding_metadata?: unknown } | null): string {
  if (!app?.onboarding_metadata || typeof app.onboarding_metadata !== 'object') return 'Unknown';
  const m = app.onboarding_metadata as Record<string, unknown>;
  return typeof m.primary_sector === 'string' && m.primary_sector.trim()
    ? m.primary_sector.trim()
    : 'Unknown';
}

export type LatestSnapshotRow = {
  investment_id: string;
  repayment_status: RepaymentStatus;
  snapshot_date: string;
  performance_score: number | null;
};

export function enrichInvestmentRow(input: {
  investment: {
    id: string;
    approved_amount_usd: number;
    disbursed_amount_usd: number;
    portfolio_latest_score: number | null;
    portfolio_last_snapshot_date: string | null;
    updated_at: string;
    portfolio_reviewer_id: string | null;
  };
  fund_name: string;
  sector: string;
  latestRepayment: RepaymentStatus | null;
  latestScore: number | null;
  lastSnapshotDate: string | null;
}) {
  const repayment = input.latestRepayment ?? 'current';
  const score = input.latestScore ?? input.investment.portfolio_latest_score;
  const lastDt = input.lastSnapshotDate ?? input.investment.portfolio_last_snapshot_date;
  const overdue = isReportingOverdue(lastDt ?? null);
  const band = derivePerformanceBand({
    performance_score: score,
    repayment_status: repayment,
    reporting_overdue: overdue,
  });
  const snapshotFlags = computeSnapshotAlertFlags({
    performance_score: score,
    repayment_status: repayment,
  });
  const alerts = buildInvestmentAlertLabels({
    snapshot_flags: snapshotFlags,
    reporting_overdue: overdue,
  });

  return {
    id: input.investment.id,
    fund_name: input.fund_name,
    sector: input.sector,
    approved_amount_usd: input.investment.approved_amount_usd,
    disbursed_amount_usd: input.investment.disbursed_amount_usd,
    performance_score: score,
    last_snapshot_date: lastDt,
    performance_band: band,
    alert_labels: alerts,
    latest_repayment_status: repayment,
    portfolio_reviewer_id: input.investment.portfolio_reviewer_id,
    updated_at: input.investment.updated_at,
  };
}
