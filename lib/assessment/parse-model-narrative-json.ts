/**
 * Parse Claude JSON output into narrative fields (meta added separately).
 * File path: lib/assessment/parse-model-narrative-json.ts
 */

export function stripJsonFences(text: string): string {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return s.trim();
}

export function extractJsonObject(text: string): string | null {
  const s = stripJsonFences(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

function strArr(x: unknown, exact: number): string[] {
  if (!Array.isArray(x)) return Array(exact).fill('');
  const out = x
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, exact);
  while (out.length < exact) out.push('');
  return out.slice(0, exact);
}

function strArrOpen(x: unknown, max: number): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

export type ParsedModelNarrative = {
  executive_summary: string;
  strengths: string[];
  concerns: string[];
  red_flags: string[];
  recommended_conditions: string[];
  ic_questions: string[];
};

export function parseModelNarrativeJson(raw: string): { ok: true; value: ParsedModelNarrative } | { ok: false; error: string } {
  const slice = extractJsonObject(raw);
  if (!slice) return { ok: false, error: 'No JSON object found in model response' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice) as unknown;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'JSON root must be an object' };
  const o = parsed as Record<string, unknown>;
  const executive_summary =
    typeof o.executive_summary === 'string' ? o.executive_summary.trim() : '';
  if (!executive_summary) return { ok: false, error: 'Missing executive_summary' };

  const strengths = strArr(o.strengths, 3);
  const concerns = strArr(o.concerns, 3);
  const ic_questions = strArr(o.ic_questions, 3);
  if (strengths.some((s) => !s)) return { ok: false, error: 'strengths must have 3 non-empty strings' };
  if (concerns.some((s) => !s)) return { ok: false, error: 'concerns must have 3 non-empty strings' };
  if (ic_questions.some((s) => !s)) return { ok: false, error: 'ic_questions must have 3 non-empty strings' };

  return {
    ok: true,
    value: {
      executive_summary,
      strengths,
      concerns,
      red_flags: strArrOpen(o.red_flags, 20),
      recommended_conditions: strArrOpen(o.recommended_conditions, 24),
      ic_questions,
    },
  };
}
