/**
 * Load active investments with latest snapshot + application for portfolio views.
 * File path: lib/portfolio/load-portfolio-data.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { enrichInvestmentRow, sectorFromApplication } from '@/lib/portfolio/queries';
import type { RepaymentStatus } from '@/lib/portfolio/types';

export type PortfolioInvestmentRow = ReturnType<typeof enrichInvestmentRow>;

export async function loadActivePortfolioRows(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PortfolioInvestmentRow[]> {
  const { data: investments, error } = await supabase
    .from('vc_investments')
    .select(
      'id, deal_id, application_id, approved_amount_usd, disbursed_amount_usd, portfolio_latest_score, portfolio_last_snapshot_date, portfolio_reviewer_id, updated_at, status',
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (error || !investments?.length) return [];

  const appIds = [...new Set(investments.map((i) => i.application_id))];
  const { data: apps } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, onboarding_metadata')
    .eq('tenant_id', tenantId)
    .in('id', appIds);

  const appById = new Map((apps ?? []).map((a) => [a.id, a]));

  const invIds = investments.map((i) => i.id);
  const { data: snaps } = await supabase
    .from('vc_portfolio_snapshots')
    .select('investment_id, snapshot_date, performance_score, repayment_status')
    .eq('tenant_id', tenantId)
    .in('investment_id', invIds)
    .order('snapshot_date', { ascending: false });

  const latest = new Map<
    string,
    { repayment_status: RepaymentStatus; performance_score: number | null; snapshot_date: string }
  >();
  for (const s of snaps ?? []) {
    if (latest.has(s.investment_id)) continue;
    latest.set(s.investment_id, {
      repayment_status: s.repayment_status as RepaymentStatus,
      performance_score: s.performance_score != null ? Number(s.performance_score) : null,
      snapshot_date: s.snapshot_date,
    });
  }

  const rows: PortfolioInvestmentRow[] = [];
  for (const inv of investments) {
    const app = appById.get(inv.application_id);
    const l = latest.get(inv.id);
    rows.push(
      enrichInvestmentRow({
        investment: {
          id: inv.id,
          approved_amount_usd: Number(inv.approved_amount_usd),
          disbursed_amount_usd: Number(inv.disbursed_amount_usd),
          portfolio_latest_score: inv.portfolio_latest_score != null ? Number(inv.portfolio_latest_score) : null,
          portfolio_last_snapshot_date: inv.portfolio_last_snapshot_date,
          updated_at: inv.updated_at,
          portfolio_reviewer_id: inv.portfolio_reviewer_id,
        },
        fund_name: app?.fund_name ?? '—',
        sector: sectorFromApplication(app ?? null),
        latestRepayment: l?.repayment_status ?? null,
        latestScore: l?.performance_score ?? null,
        lastSnapshotDate: l?.snapshot_date ?? null,
      }),
    );
  }

  return rows;
}

export async function loadDeploymentByMonth(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ month: string; amount_usd: number }[]> {
  const { data: rows } = await supabase
    .from('vc_disbursements')
    .select('amount_usd, disbursement_date, updated_at, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'disbursed');

  const byMonth = new Map<string, number>();
  for (const r of rows ?? []) {
    const raw = (r as { disbursement_date?: string | null; updated_at?: string }).disbursement_date;
    const d = raw ? new Date(raw) : new Date((r as { updated_at?: string }).updated_at ?? Date.now());
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number((r as { amount_usd: number }).amount_usd));
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount_usd]) => ({ month, amount_usd }));
}
