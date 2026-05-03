import type { CriteriaKey } from '@/lib/scoring/config';
import { ASSESSMENT_CRITERIA, CRITERIA_ORDER, getCriteriaDef } from '@/lib/scoring/config';
import {
  buildSectionResults,
  calculateWeightedScore,
  type SectionScoreInput,
} from '@/lib/scoring/calculate';

/** Maps scoring criteria to DD questionnaire section keys for pulling relevant answers. */
export const CRITERIA_TO_DD_SECTION_KEYS: Record<CriteriaKey, readonly string[]> = {
  firm: ['sponsor', 'staff_bios'],
  fundraising: ['basic_info', 'investors_fundraising', 'sponsor'],
  team: ['sponsor', 'staff_bios'],
  investment_strategy: ['investment_strategy'],
  investment_process: ['portfolio_monitoring', 'deal_flow'],
  representative_pipeline: ['deal_flow'],
  governance: ['sponsor', 'governing_rules', 'legal'],
};

export const DD_SECTION_DISPLAY_LABEL: Record<string, string> = {
  basic_info: 'Fund identity & basics',
  sponsor: 'Sponsor / manager',
  deal_flow: 'Deal flow & pipeline',
  investment_strategy: 'Investment strategy',
  portfolio_monitoring: 'Portfolio monitoring',
  governing_rules: 'Governing rules',
  investors_fundraising: 'Investors & fundraising',
  legal: 'Legal',
  staff_bios: 'Staff bios',
};

export type DdAnswerRow = {
  question_key: string;
  answer_text: string | null;
  answer_value: number | null;
  answer_boolean: boolean | null;
  answer_json: unknown;
  section_key: string;
  section_status: string;
};

export type WeakSectionSummary = {
  criteriaKey: CriteriaKey;
  sectionLabel: string;
  weightPercent: number;
  sectionScore: number;
  sectionMax: number;
  percentage: number;
};

export type ClaudeFollowupItem = {
  section_key: string;
  section_label: string;
  section_score: number;
  section_max_score: number;
  question: string;
  rationale: string;
};

export function formatDdAnswerSnippet(row: DdAnswerRow): string {
  const text = row.answer_text?.trim();
  if (text) return text.slice(0, 500);
  if (row.answer_json !== null && row.answer_json !== undefined) {
    try {
      return JSON.stringify(row.answer_json).slice(0, 500);
    } catch {
      return '[complex value]';
    }
  }
  if (row.answer_value !== null && row.answer_value !== undefined) {
    return String(row.answer_value).slice(0, 500);
  }
  if (row.answer_boolean !== null && row.answer_boolean !== undefined) {
    return row.answer_boolean ? 'Yes' : 'No';
  }
  return '';
}

/** Build section inputs from DB subcriteria rows (same shape as complete route). */
export function buildSectionInputsFromDb(
  criteriaRows: Array<{ criteria_key: string; id: string }>,
  subRowsByCriteriaId: Map<string, Array<{ subcriteria_key: string; score: number | null }>>,
): SectionScoreInput[] {
  const inputs: SectionScoreInput[] = [];
  for (const key of CRITERIA_ORDER) {
    const crit = criteriaRows.find((c) => c.criteria_key === key);
    if (!crit) continue;
    const subs = subRowsByCriteriaId.get(crit.id) ?? [];
    inputs.push({
      criteriaKey: key,
      subcriteria: subs
        .filter((s) => s.score !== null && s.score !== undefined)
        .map((s) => ({ key: s.subcriteria_key, score: Number(s.score) })),
    });
  }
  return inputs;
}

export function computeWeakestSections(sectionInputs: SectionScoreInput[]): {
  sections: WeakSectionSummary[];
  overallScore: number;
  allSectionsAboveThreshold: boolean;
  thresholdPercent: number;
} {
  const { sections, errors } = buildSectionResults(sectionInputs);
  const thresholdPercent = 70;
  if (errors.length) {
    return { sections: [], overallScore: 0, allSectionsAboveThreshold: false, thresholdPercent };
  }
  const overallScore = calculateWeightedScore(sections);
  const summaries: WeakSectionSummary[] = sections.map((s) => {
    const def = getCriteriaDef(s.criteriaKey);
    const pct = s.sectionMax > 0 ? (s.sectionTotal / s.sectionMax) * 100 : 0;
    return {
      criteriaKey: s.criteriaKey,
      sectionLabel: def?.title ?? s.criteriaKey,
      weightPercent: s.weightPercent,
      sectionScore: s.sectionTotal,
      sectionMax: s.sectionMax,
      percentage: Math.round(pct * 10) / 10,
    };
  });
  summaries.sort((a, b) => a.percentage - b.percentage);
  const allSectionsAboveThreshold = summaries.every((x) => x.percentage >= thresholdPercent);
  const weakest = summaries.slice(0, 3);
  return {
    sections: weakest,
    overallScore,
    allSectionsAboveThreshold,
    thresholdPercent,
  };
}

export function answersForSingleWeakSection(w: WeakSectionSummary, allAnswers: DdAnswerRow[]): string {
  const keys = new Set(CRITERIA_TO_DD_SECTION_KEYS[w.criteriaKey] ?? []);
  const lines: string[] = [];
  for (const row of allAnswers) {
    if (!keys.has(row.section_key)) continue;
    const snippet = formatDdAnswerSnippet(row);
    if (!snippet.trim()) continue;
    const secLabel = DD_SECTION_DISPLAY_LABEL[row.section_key] ?? row.section_key;
    lines.push(`[${secLabel}] ${row.question_key}: ${snippet}`);
  }
  return lines.join('\n');
}

export function buildFollowupUserPrompt(params: {
  fundName: string;
  overallScore: number;
  weakest: WeakSectionSummary[];
  allAnswers: DdAnswerRow[];
}): string {
  const weakestBlocks = params.weakest
    .map((w) => {
      const ans = answersForSingleWeakSection(w, params.allAnswers);
      return `Section: ${w.sectionLabel}
Weight in rubric: ${w.weightPercent}%
Score achieved: ${w.sectionScore}/${w.sectionMax} (${w.percentage}%)
Key answers provided:
${ans.trim() ? ans.slice(0, 3500) : '(No structured answers matched these questionnaire sections.)'}`;
    })
    .join('\n\n');

  return `A fund has submitted a DD questionnaire and been scored on the following rubric sections. The three weakest sections are listed below with their scores, weights, and the actual answers provided.

Fund: ${params.fundName}
Overall Score: ${params.overallScore.toFixed(1)}%
Acceptance Threshold: 70%

WEAKEST SECTIONS:
${weakestBlocks}

Generate exactly 5 follow-up questions total distributed across these weak sections (not necessarily one per section — weight toward the weakest). Each question must:
- Target a specific gap or vague response in their answers
- Be open-ended and require a substantive response
- Be answerable in a follow-up meeting or written response
- Be professional and appropriate for a development bank context
- Where relevant, reference DBJ's developmental mandate (job creation, SME support, Caribbean economic development)

Respond with valid JSON only. No markdown, no backticks, no preamble:
[
  {
    "section_key": "",
    "section_label": "",
    "section_score": 0,
    "section_max_score": 0,
    "question": "",
    "rationale": ""
  }
]`;
}

export function parseClaudeFollowupJson(text: string): ClaudeFollowupItem[] | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const candidates = [cleaned];
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch?.[0]) candidates.push(arrMatch[0]);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (!Array.isArray(parsed)) continue;
      const out: ClaudeFollowupItem[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const section_key = typeof o.section_key === 'string' ? o.section_key : '';
        const section_label = typeof o.section_label === 'string' ? o.section_label : '';
        const question = typeof o.question === 'string' ? o.question : '';
        const rationale = typeof o.rationale === 'string' ? o.rationale : '';
        const section_score = Number(o.section_score);
        const section_max_score = Number(o.section_max_score);
        if (!section_key || !section_label || !question) continue;
        if (!Number.isFinite(section_score) || !Number.isFinite(section_max_score)) continue;
        out.push({
          section_key,
          section_label,
          section_score,
          section_max_score,
          question,
          rationale,
        });
      }
      if (out.length > 0) return out;
    } catch {
      continue;
    }
  }
  return null;
}

export function validateFollowupAgainstCriteria(items: ClaudeFollowupItem[]): ClaudeFollowupItem[] {
  const allowed = new Set(ASSESSMENT_CRITERIA.map((c) => c.key));
  return items.filter((q) => allowed.has(q.section_key as CriteriaKey));
}
