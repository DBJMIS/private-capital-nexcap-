/** Stored shape for vc_assessments.ai_narrative. File: lib/assessment/ai-narrative-types.ts */

export const AI_NARRATIVE_DISCLAIMER = 'AI-Generated — For Reference Only' as const;

export type AssessmentAiNarrativeMeta = {
  generated_at: string;
  model: string;
  outcome_band: string;
  outcome_label: string;
  recommendation_label: string;
  overall_score: number;
  passed: boolean;
  last_edited_at?: string;
  last_edited_by_user_id?: string;
};

export type AssessmentAiNarrative = {
  disclaimer_label: typeof AI_NARRATIVE_DISCLAIMER;
  executive_summary: string;
  strengths: string[];
  concerns: string[];
  red_flags: string[];
  recommended_conditions: string[];
  ic_questions: string[];
  meta: AssessmentAiNarrativeMeta;
};

export function isAssessmentAiNarrative(x: unknown): x is AssessmentAiNarrative {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return Boolean(
    o.disclaimer_label === AI_NARRATIVE_DISCLAIMER &&
      typeof o.executive_summary === 'string' &&
      Array.isArray(o.strengths) &&
      Array.isArray(o.concerns) &&
      Array.isArray(o.red_flags) &&
      Array.isArray(o.recommended_conditions) &&
      Array.isArray(o.ic_questions) &&
      o.meta &&
      typeof o.meta === 'object',
  );
}
