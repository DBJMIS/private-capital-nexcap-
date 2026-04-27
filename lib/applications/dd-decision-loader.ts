import type { SupabaseClient } from '@supabase/supabase-js';

import { aggregatePanelScoreRows } from '@/lib/applications/dd-decision-aggregate';
import type { Json } from '@/types/database';

export type DdDecisionRowView = {
  id: string;
  ai_recommendation: Json | null;
  ai_recommended_at: string | null;
  ai_weighted_score: number | null;
  final_decision: string | null;
  strong_points: string | null;
  weak_points: string | null;
  conditions: string | null;
  rejection_reason: string | null;
  decision_overrides_ai: boolean;
  decided_by: string | null;
  decider_name: string | null;
  decided_at: string | null;
};

export async function loadDdDecisionAggregation(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
): Promise<
  | {
      ok: true;
      fund_name: string;
      application_status: string;
      panel_evaluation_count: number;
      vote_totals: { full_dd: number; conditional_dd: number; no_dd: number };
      criteria_aggregates: ReturnType<typeof aggregatePanelScoreRows>['criteria'];
      category_averages: Record<string, number>;
      overall_average: number;
      dd_row: DdDecisionRowView | null;
    }
  | { ok: false; error: string; status: number }
> {
  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, status')
    .eq('tenant_id', tenantId)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr) return { ok: false, error: appErr.message, status: 500 };
  if (!app) return { ok: false, error: 'Application not found', status: 404 };

  const { data: evals, error: evalErr } = await supabase
    .from('vc_panel_evaluations')
    .select('id, dd_vote')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId);

  if (evalErr) return { ok: false, error: evalErr.message, status: 500 };

  const evaluationIds = (evals ?? []).map((e) => e.id as string);
  const { data: scores, error: scoreErr } = evaluationIds.length
    ? await supabase
        .from('vc_panel_evaluation_scores')
        .select('criterion_key, rating')
        .eq('tenant_id', tenantId)
        .in('evaluation_id', evaluationIds)
    : { data: [], error: null };

  if (scoreErr) return { ok: false, error: scoreErr.message, status: 500 };

  const vote_totals = {
    full_dd: (evals ?? []).filter((e) => e.dd_vote === 'full_dd').length,
    conditional_dd: (evals ?? []).filter((e) => e.dd_vote === 'conditional_dd').length,
    no_dd: (evals ?? []).filter((e) => e.dd_vote === 'no_dd').length,
  };

  const scoreRows = (scores ?? []).map((s) => ({
    criterion_key: String((s as { criterion_key: string }).criterion_key),
    rating: (s as { rating: string | null }).rating,
  }));

  const { criteria, category_averages, overall_average } = aggregatePanelScoreRows(scoreRows);

  const { data: ddRow, error: ddErr } = await supabase
    .from('vc_dd_decisions')
    .select(
      'id, ai_recommendation, ai_recommended_at, ai_weighted_score, final_decision, strong_points, weak_points, conditions, rejection_reason, decision_overrides_ai, decided_by, decider_name, decided_at',
    )
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (ddErr) return { ok: false, error: ddErr.message, status: 500 };

  return {
    ok: true,
    fund_name: (app as { fund_name: string }).fund_name,
    application_status: (app as { status: string }).status,
    panel_evaluation_count: (evals ?? []).length,
    vote_totals,
    criteria_aggregates: criteria,
    category_averages,
    overall_average,
    dd_row: ddRow as DdDecisionRowView | null,
  };
}
