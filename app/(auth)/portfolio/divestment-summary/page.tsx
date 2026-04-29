import { DivestmentSummaryClient } from '@/components/portfolio/DivestmentSummaryClient';
import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import type { DivestmentSummaryRow } from '@/lib/portfolio/types';
import { createServerClient } from '@/lib/supabase/server';
import type { VcQuarterlyAssessment } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function DivestmentSummaryPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const supabase = createServerClient();
  const tenantId = profile.tenant_id;

  const [fundsRes, assessmentsRes, snapsRes] = await Promise.all([
    supabase
      .from('vc_portfolio_funds')
      .select('id, fund_name, fund_category, currency, commitment_date')
      .eq('tenant_id', tenantId)
      .eq('fund_status', 'active')
      .order('fund_name'),
    supabase
      .from('vc_quarterly_assessments')
      .select(
        'id, fund_id, assessment_period, assessment_date, approved_at, status, investment_stage, financial_performance_score, development_impact_score, dd_outcome_at_commitment, contractual_obligation, divestment_recommendation, weighted_total_score, category, ai_summary, fund_lifecycle_stage, dd_assessment_id',
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false }),
    supabase
      .from('vc_fund_snapshots')
      .select('fund_id, committed_capital, snapshot_date')
      .eq('tenant_id', tenantId)
      .order('snapshot_date', { ascending: false }),
  ]);

  if (fundsRes.error) return <p className="text-sm text-red-700">Error loading funds: {fundsRes.error.message}</p>;
  if (assessmentsRes.error) return <p className="text-sm text-red-700">Error loading assessments: {assessmentsRes.error.message}</p>;
  if (snapsRes.error) return <p className="text-sm text-red-700">Error loading snapshots: {snapsRes.error.message}</p>;

  const funds = (fundsRes.data ?? []) as Array<{
    id: string;
    fund_name: string;
    fund_category: string | null;
    currency: string;
    commitment_date: string | null;
  }>;
  const byFund = new Map(funds.map((f) => [f.id, f]));

  const latestApprovedByFund = new Map<string, VcQuarterlyAssessment>();
  for (const a of (assessmentsRes.data ?? []) as VcQuarterlyAssessment[]) {
    if (!latestApprovedByFund.has(a.fund_id)) latestApprovedByFund.set(a.fund_id, a);
  }

  const snapshotsByFund = new Map<string, { committed_capital: number | null; snapshot_date: string }>();
  for (const s of (snapsRes.data ?? []) as Array<{ fund_id: string; committed_capital: number | null; snapshot_date: string }>) {
    if (!snapshotsByFund.has(s.fund_id)) snapshotsByFund.set(s.fund_id, s);
  }

  const ddIds = Array.from(latestApprovedByFund.values())
    .map((r) => r.dd_assessment_id)
    .filter((v): v is string => !!v);
  const { data: ddRows } = ddIds.length
    ? await supabase
        .from('vc_assessments')
        .select('id, recommendation, overall_weighted_score, overall_score, completed_at')
        .eq('tenant_id', tenantId)
        .in('id', ddIds)
    : { data: [] };
  const ddById = new Map(
    ((ddRows ?? []) as Array<{ id: string; recommendation: string | null; overall_weighted_score: number | null; overall_score: number | null; completed_at: string | null }>).map((r) => [
      r.id,
      r,
    ]),
  );

  const rows: DivestmentSummaryRow[] = Array.from(latestApprovedByFund.values())
    .map((a) => {
      const fund = byFund.get(a.fund_id);
      if (!fund) return null;
      const dd = a.dd_assessment_id ? ddById.get(a.dd_assessment_id) ?? null : null;
      return {
        fund_id: fund.id,
        fund_name: fund.fund_name,
        currency: fund.currency,
        fund_category: fund.fund_category,
        commitment_year: fund.commitment_date ? new Date(`${fund.commitment_date}T12:00:00`).getFullYear() : null,
        assessment_id: a.id,
        assessment_period: a.assessment_period,
        assessment_date: a.assessment_date,
        approved_at: a.approved_at,
        investment_stage: (a.investment_stage as DivestmentSummaryRow['investment_stage']) ?? null,
        financial_performance_score: a.financial_performance_score != null ? Number(a.financial_performance_score) : null,
        development_impact_score: a.development_impact_score != null ? Number(a.development_impact_score) : null,
        dd_outcome_at_commitment: a.dd_outcome_at_commitment,
        contractual_obligation: !!a.contractual_obligation,
        divestment_recommendation: a.divestment_recommendation,
        weighted_total_score: a.weighted_total_score != null ? Number(a.weighted_total_score) : null,
        category: a.category,
        ai_summary: a.ai_summary,
        fund_lifecycle_stage: a.fund_lifecycle_stage,
        dd_assessment_id: a.dd_assessment_id,
        dd_reference: dd
          ? {
              recommendation: dd.recommendation,
              score: dd.overall_weighted_score ?? dd.overall_score ?? null,
              completed_at: dd.completed_at,
            }
          : null,
      } satisfies DivestmentSummaryRow;
    })
    .filter((x): x is DivestmentSummaryRow => !!x)
    .sort((a, b) => a.fund_name.localeCompare(b.fund_name));

  const newestAssessment = rows
    .map((r) => r.approved_at ?? r.assessment_date)
    .filter(Boolean)
    .sort()
    .at(-1);
  const asAt = newestAssessment
    ? new Date(`${newestAssessment}`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return <DivestmentSummaryClient rows={rows} asAt={asAt} />;
}
