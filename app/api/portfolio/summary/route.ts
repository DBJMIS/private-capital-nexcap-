import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { loadActivePortfolioRows, loadDeploymentByMonth } from '@/lib/portfolio/load-portfolio-data';
import type { RepaymentStatus } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

function atRisk(row: { performance_band: string; alert_labels: string[] }): boolean {
  return (
    row.performance_band === 'critical' ||
    row.performance_band === 'underperforming' ||
    row.alert_labels.includes('Reporting Overdue')
  );
}

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rows = await loadActivePortfolioRows(supabase, profile.tenant_id);
  const deployment = await loadDeploymentByMonth(supabase, profile.tenant_id);

  let totalApproved = 0;
  let totalDisbursed = 0;
  const scores: number[] = [];
  let atRiskCount = 0;

  const riskDistribution = { performing: 0, watch: 0, underperforming: 0, critical: 0 };

  const sectorMap = new Map<string, number>();
  const repaymentCount: Record<RepaymentStatus, number> = {
    current: 0,
    delinquent: 0,
    default: 0,
  };

  for (const r of rows) {
    totalApproved += r.approved_amount_usd;
    totalDisbursed += r.disbursed_amount_usd;
    if (r.performance_score != null) scores.push(r.performance_score);
    if (atRisk(r)) atRiskCount += 1;
    riskDistribution[r.performance_band] += 1;

    sectorMap.set(r.sector, (sectorMap.get(r.sector) ?? 0) + r.approved_amount_usd);

    const rep = r.latest_repayment_status as RepaymentStatus;
    repaymentCount[rep] += 1;
  }

  const avgScore =
    scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;

  const sector_exposure = [...sectorMap.entries()]
    .map(([sector, amount_usd]) => ({ sector, amount_usd }))
    .sort((a, b) => b.amount_usd - a.amount_usd);

  const sectors = [...new Set(rows.map((r) => r.sector))].sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    active_investment_count: rows.length,
    total_approved_usd: totalApproved,
    total_disbursed_usd: totalDisbursed,
    average_performance_score: avgScore,
    investments_at_risk_count: atRiskCount,
    risk_distribution: riskDistribution,
    deployment_by_month: deployment,
    sector_exposure,
    repayment_breakdown: repaymentCount,
    sectors,
  });
}
