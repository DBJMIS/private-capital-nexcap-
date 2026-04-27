/**
 * Claude-backed narrative generation for completed assessments.
 * File path: lib/assessment/generate-assessment-narrative.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ASSESSMENT_AI_JSON_INSTRUCTION,
  ASSESSMENT_AI_NARRATIVE_SYSTEM_PROMPT,
} from '@/lib/assessment/ai-narrative-constants';
import { AI_NARRATIVE_DISCLAIMER, type AssessmentAiNarrative } from '@/lib/assessment/ai-narrative-types';
import {
  buildAssessmentNarrativeUserMessage,
  buildQuestionnaireExcerpt,
  buildScoringExcerpt,
  type CriteriaPayloadRow,
} from '@/lib/assessment/narrative-context';
import { parseModelNarrativeJson } from '@/lib/assessment/parse-model-narrative-json';
import { loadQuestionnaireAnswersSummary } from '@/lib/questionnaire/load-questionnaire-answers-summary';
import { CRITERIA_ORDER, type CriteriaKey } from '@/lib/scoring/config';
import { determineOutcome } from '@/lib/scoring/calculate';

function firstTextBlock(content: Anthropic.Message['content']): string {
  for (const block of content) {
    if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
      return block.text;
    }
  }
  return '';
}

async function loadCriteriaNested(
  supabase: SupabaseClient,
  tenantId: string,
  assessmentId: string,
): Promise<CriteriaPayloadRow[]> {
  const { data: criteria } = await supabase
    .from('vc_assessment_criteria')
    .select('*')
    .eq('assessment_id', assessmentId)
    .eq('tenant_id', tenantId)
    .order('criteria_key', { ascending: true });

  const critIds = (criteria ?? []).map((c: { id: string }) => c.id);
  let subs: Array<{
    criteria_id: string;
    subcriteria_key: string;
    description: string | null;
    score: number | null;
    max_points: number;
    notes: string | null;
  }> = [];
  if (critIds.length) {
    const { data: subRows } = await supabase
      .from('vc_assessment_subcriteria')
      .select('criteria_id, subcriteria_key, description, score, max_points, notes')
      .eq('tenant_id', tenantId)
      .in('criteria_id', critIds)
      .order('subcriteria_key', { ascending: true });
    subs = (subRows ?? []) as typeof subs;
  }
  const subByCrit = new Map<string, typeof subs>();
  for (const s of subs) {
    const arr = subByCrit.get(s.criteria_id) ?? [];
    arr.push(s);
    subByCrit.set(s.criteria_id, arr);
  }

  const order = new Map(CRITERIA_ORDER.map((k, i) => [k, i]));
  const rows: CriteriaPayloadRow[] = (criteria ?? []).map((c) => {
    const row = c as {
      id: string;
      criteria_key: string;
      raw_score: number | null;
      weighted_score: number | null;
      max_points: number;
      criteria_weight: number;
      evaluator_notes: string | null;
    };
    const rawSubs = subByCrit.get(row.id) ?? [];
    const subcriteria = rawSubs.map((s) => ({
      subcriteria_key: s.subcriteria_key,
      description: s.description,
      score: s.score,
      max_points: s.max_points,
      notes: s.notes,
    }));
    return {
      criteria_key: row.criteria_key,
      raw_score: row.raw_score,
      weighted_score: row.weighted_score,
      max_points: Number(row.max_points),
      criteria_weight: Number(row.criteria_weight),
      evaluator_notes: row.evaluator_notes,
      subcriteria,
    };
  });

  rows.sort(
    (a, b) =>
      (order.get(a.criteria_key as CriteriaKey) ?? 99) - (order.get(b.criteria_key as CriteriaKey) ?? 99),
  );
  return rows;
}

export type GenerateNarrativeResult =
  | { ok: true; narrative: AssessmentAiNarrative }
  | { ok: false; error: string };

/**
 * Loads assessment + questionnaire context, calls Claude, persists `ai_narrative` on success.
 */
export async function generateAndPersistAssessmentNarrative(options: {
  supabase: SupabaseClient;
  tenantId: string;
  assessmentId: string;
  anthropicApiKey: string;
}): Promise<GenerateNarrativeResult> {
  const { supabase, tenantId, assessmentId, anthropicApiKey } = options;

  const anthropicModel = process.env.ANTHROPIC_MODEL?.trim();
  if (!anthropicModel) {
    return { ok: false, error: 'ANTHROPIC_MODEL is not configured' };
  }

  const { data: assessment, error: aErr } = await supabase
    .from('vc_assessments')
    .select(
      'id, status, application_id, questionnaire_id, overall_score, passed, recommendation, evaluator_id',
    )
    .eq('id', assessmentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (aErr || !assessment) return { ok: false, error: 'Assessment not found' };
  if (assessment.status !== 'completed' && assessment.status !== 'approved') {
    return { ok: false, error: 'Assessment must be completed before generating AI narrative' };
  }
  const overall = assessment.overall_score != null ? Number(assessment.overall_score) : NaN;
  if (!Number.isFinite(overall)) return { ok: false, error: 'Overall score is missing' };

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('fund_name, manager_name')
    .eq('id', assessment.application_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const criteriaRows = await loadCriteriaNested(supabase, tenantId, assessmentId);
  const scoring_excerpt = buildScoringExcerpt(criteriaRows);

  const qSummary = await loadQuestionnaireAnswersSummary(
    supabase,
    tenantId,
    assessment.questionnaire_id as string,
  );
  const questionnaire_excerpt = buildQuestionnaireExcerpt(qSummary);

  const outcome = determineOutcome(overall);
  const userMessage = buildAssessmentNarrativeUserMessage({
    fund_name: (app?.fund_name as string) ?? 'Unknown fund',
    manager_name: (app?.manager_name as string) ?? 'Unknown manager',
    overall_score: outcome.overallScore,
    passed: outcome.passed,
    outcome_band: outcome.band,
    outcome_label: outcome.label,
    recommendation_label: outcome.recommendationLabel,
    scoring_excerpt,
    questionnaire_excerpt,
  });

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  let text = '';
  try {
    const msg = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 4096,
      system: `${ASSESSMENT_AI_NARRATIVE_SYSTEM_PROMPT}\n\n${ASSESSMENT_AI_JSON_INSTRUCTION}`,
      messages: [{ role: 'user', content: userMessage }],
    });
    text = firstTextBlock(msg.content);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Claude request failed' };
  }

  const parsed = parseModelNarrativeJson(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const now = new Date().toISOString();
  const narrative: AssessmentAiNarrative = {
    disclaimer_label: AI_NARRATIVE_DISCLAIMER,
    executive_summary: parsed.value.executive_summary,
    strengths: parsed.value.strengths,
    concerns: parsed.value.concerns,
    red_flags: parsed.value.red_flags,
    recommended_conditions: parsed.value.recommended_conditions,
    ic_questions: parsed.value.ic_questions,
    meta: {
      generated_at: now,
      model: anthropicModel,
      outcome_band: outcome.band,
      outcome_label: outcome.label,
      recommendation_label: outcome.recommendationLabel,
      overall_score: outcome.overallScore,
      passed: outcome.passed,
    },
  };

  const { error: up } = await supabase
    .from('vc_assessments')
    .update({ ai_narrative: narrative as unknown as Record<string, unknown> })
    .eq('id', assessmentId)
    .eq('tenant_id', tenantId);

  if (up) return { ok: false, error: up.message };

  return { ok: true, narrative };
}
