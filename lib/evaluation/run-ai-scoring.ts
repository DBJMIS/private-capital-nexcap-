import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ASSESSMENT_CRITERIA, type CriteriaKey } from '@/lib/scoring/config';
import { sectionMaxPoints } from '@/lib/scoring/config';
import { scheduleAuditLog } from '@/lib/audit/log';

import { loadQuestionnairePlaintext } from '@/lib/evaluation/load-questionnaire-plaintext';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

function rubricBlock(criteriaKey: CriteriaKey): string {
  const c = ASSESSMENT_CRITERIA.find((x) => x.key === criteriaKey);
  if (!c) return '';
  return c.subcriteria.map((s) => `- ${s.label} (weight within criterion: ${s.maxPoints} pts)`).join('\n');
}

async function scoreCriterion(params: {
  apiKey: string;
  model: string;
  criteriaKey: CriteriaKey;
  criteriaTitle: string;
  weightPercent: number;
  fundText: string;
}): Promise<{ score: number; reasoning: string; weighted: number }> {
  const { apiKey, model, criteriaKey, criteriaTitle, weightPercent, fundText } = params;
  const anthropic = new Anthropic({ apiKey });
  const system = `You are a fund evaluation specialist at the Development Bank of Jamaica. Score the following fund manager's response to the ${criteriaTitle.toUpperCase()} criteria on a scale of 1-5 based on the rubric provided. Return JSON only: {"score": number, "reasoning": string}`;
  const user = `Rubric:\n${rubricBlock(criteriaKey)}\n\nFund Manager Response (questionnaire excerpts):\n${fundText.slice(0, 60_000)}`;

  const msg = await anthropic.messages.create({
    model,
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();

  let score = 3;
  let reasoning = text;
  try {
    const parsed = JSON.parse(text) as { score?: number; reasoning?: string };
    if (typeof parsed.score === 'number' && parsed.score >= 1 && parsed.score <= 5) {
      score = Math.round(parsed.score);
    }
    if (typeof parsed.reasoning === 'string') reasoning = parsed.reasoning;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]) as { score?: number; reasoning?: string };
        if (typeof parsed.score === 'number' && parsed.score >= 1 && parsed.score <= 5) {
          score = Math.round(parsed.score);
        }
        if (typeof parsed.reasoning === 'string') reasoning = parsed.reasoning;
      } catch {
        /* keep defaults */
      }
    }
  }

  const weighted = (score / 5) * weightPercent;
  return { score, reasoning, weighted };
}

export async function runAiScoringForApplication(params: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  questionnaireId: string;
  evaluatorUserId: string;
  actorIdForAudit: string;
}): Promise<{ ok: true; assessmentId: string; overall: number } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not configured' };
  }

  const fundText = await loadQuestionnairePlaintext(params.supabase, params.tenantId, params.questionnaireId);

  const results = await Promise.all(
    ASSESSMENT_CRITERIA.map((c) =>
      scoreCriterion({
        apiKey,
        model,
        criteriaKey: c.key,
        criteriaTitle: c.title,
        weightPercent: c.weightPercent,
        fundText,
      }).then((r) => ({ key: c.key, ...r, maxPoints: sectionMaxPoints(c.key) })),
    ),
  );

  const overall = Math.round(results.reduce((s, r) => s + r.weighted, 0) * 100) / 100;
  const passed = overall >= 70;

  const { data: assessment, error: aErr } = await params.supabase
    .from('vc_assessments')
    .insert({
      tenant_id: params.tenantId,
      application_id: params.applicationId,
      questionnaire_id: params.questionnaireId,
      evaluator_id: params.evaluatorUserId,
      status: 'in_progress',
      pass_threshold: 70,
      overall_score: overall,
      overall_weighted_score: overall,
      passed,
    })
    .select('id')
    .single();

  if (aErr || !assessment) {
    return { ok: false, error: aErr?.message ?? 'Failed to create assessment' };
  }

  const critRows = results.map((r) => ({
    tenant_id: params.tenantId,
    assessment_id: assessment.id,
    criteria_key: r.key,
    criteria_weight: ASSESSMENT_CRITERIA.find((c) => c.key === r.key)!.weightPercent,
    max_points: r.maxPoints,
    raw_score: r.score,
    weighted_score: r.weighted,
    ai_reasoning: r.reasoning,
    evaluator_notes: null as string | null,
  }));

  const { error: cErr } = await params.supabase.from('vc_assessment_criteria').insert(critRows);
  if (cErr) {
    await params.supabase.from('vc_assessments').delete().eq('id', assessment.id).eq('tenant_id', params.tenantId);
    return { ok: false, error: cErr.message };
  }

  await params.supabase
    .from('vc_assessments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', assessment.id)
    .eq('tenant_id', params.tenantId);

  scheduleAuditLog({
    tenantId: params.tenantId,
    actorId: params.actorIdForAudit,
    entityType: 'assessment',
    entityId: assessment.id,
    action: 'ai_scored',
    afterState: { overall_score: overall, passed },
    metadata: { source: 'evaluation_submit' },
  });

  return { ok: true, assessmentId: assessment.id, overall };
}
