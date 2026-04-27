import type { AiSubcriteriaEntry } from '@/lib/assessment/dd-ai-assess-prompt';
import type { CriteriaKey } from '@/lib/scoring/config';

export type AiSuggestionStore = {
  criteria: Record<
    string,
    {
      subcriteria?: Record<string, AiSubcriteriaEntry>;
    }
  >;
};

export function parseAiSuggestionStore(raw: unknown): AiSuggestionStore | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const c = o.criteria;
  if (!c || typeof c !== 'object') return null;
  return { criteria: c as AiSuggestionStore['criteria'] };
}

export function getAiSubcriteriaSuggestion(
  store: AiSuggestionStore | null,
  ck: CriteriaKey,
  sk: string,
): AiSubcriteriaEntry | null {
  if (!store) return null;
  const block = store.criteria[ck];
  const sub = block?.subcriteria?.[sk];
  if (!sub) return null;
  const n = Number(sub.suggested_score);
  if (!Number.isFinite(n)) return null;
  return {
    suggested_score: n,
    max_points: Number(sub.max_points) || 0,
    evidence: typeof sub.evidence === 'string' ? sub.evidence : '',
    reasoning: typeof sub.reasoning === 'string' ? sub.reasoning : '',
  };
}
