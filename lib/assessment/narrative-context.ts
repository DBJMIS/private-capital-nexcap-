/**
 * Build user message payload for assessment AI narrative from DB-shaped data.
 * File path: lib/assessment/narrative-context.ts
 */

import type { QuestionnaireAnswersSummary } from '@/lib/questionnaire/load-questionnaire-answers-summary';
import { ASSESSMENT_CRITERIA, type CriteriaKey } from '@/lib/scoring/config';

/** Question keys pulled from the DD questionnaire for IC-relevant context. */
const DD_KEYS_BY_SECTION: Record<string, string[]> = {
  sponsor: [
    'track_record_vc_pe',
    'financial_strength_evidence',
    'shareholders',
    'has_conflicts_of_interest',
    'conflicts_description',
    'has_regulations',
    'regulations_list',
    'has_litigation',
    'litigation_description',
    'investment_professionals',
  ],
  investment_strategy: [
    'stage_allocation',
    'jamaica_min_allocation_pct',
    'gross_irr_target_pct',
    'net_irr_target_pct',
    'sector_allocations',
    'geographic_allocations',
    'investment_instruments',
    'investment_thesis',
  ],
  deal_flow: ['sourcing_strategy', 'pipeline_companies', 'competitive_advantage', 'esg_guidelines'],
  governing_rules: [
    'investment_committee',
    'other_committees',
    'shareholder_meetings_voting',
    'distribution_waterfall',
    'commitment_thresholds',
  ],
};

function answerCell(
  row: QuestionnaireAnswersSummary['by_section'][string][number] | undefined,
): string {
  if (!row) return '';
  const t = row.answer_text?.trim();
  if (t) return t;
  if (row.answer_value != null && Number.isFinite(row.answer_value)) return String(row.answer_value);
  if (row.answer_boolean != null) return row.answer_boolean ? 'Yes' : 'No';
  if (row.answer_json != null) {
    try {
      const s = JSON.stringify(row.answer_json);
      return s.length > 6000 ? `${s.slice(0, 6000)}…` : s;
    } catch {
      return '';
    }
  }
  return '';
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function buildQuestionnaireExcerpt(summary: QuestionnaireAnswersSummary, maxPerField = 2200): string {
  const lines: string[] = [];
  for (const [section, keys] of Object.entries(DD_KEYS_BY_SECTION)) {
    const rows = summary.by_section[section] ?? [];
    const byKey = new Map(rows.map((r) => [r.question_key, r]));
    for (const k of keys) {
      const text = truncate(answerCell(byKey.get(k)), maxPerField);
      if (text) lines.push(`${section}.${k}:\n${text}`);
    }
  }
  if (summary.staff_bios.length) {
    lines.push('Key team (staff bios summary):');
    for (const b of summary.staff_bios.slice(0, 12)) {
      const parts = [
        b.full_name,
        b.work_experience ? truncate(b.work_experience, 1200) : '',
        b.fund_responsibilities ? truncate(b.fund_responsibilities, 800) : '',
      ].filter(Boolean);
      if (parts.length) lines.push(parts.join('\n'));
    }
  }
  return lines.join('\n\n---\n\n');
}

export type CriteriaPayloadRow = {
  criteria_key: string;
  raw_score: number | null;
  weighted_score: number | null;
  max_points: number;
  criteria_weight: number;
  evaluator_notes: string | null;
  subcriteria: Array<{
    subcriteria_key: string;
    description: string | null;
    score: number | null;
    max_points: number;
    notes: string | null;
  }>;
};

export function buildScoringExcerpt(rows: CriteriaPayloadRow[]): string {
  const byKey = new Map(rows.map((r) => [r.criteria_key as CriteriaKey, r]));
  const lines: string[] = [];
  for (const def of ASSESSMENT_CRITERIA) {
    const r = byKey.get(def.key);
    if (!r) continue;
    lines.push(
      `## ${def.title} (weight ${def.weightPercent}% of 100, section max ${r.max_points} raw points)`,
    );
    lines.push(
      `Section raw total: ${r.raw_score ?? 'n/a'} / ${r.max_points} · Weighted contribution to overall (0–100 scale): ${r.weighted_score ?? 'n/a'}`,
    );
    if (r.evaluator_notes?.trim()) lines.push(`Section notes: ${r.evaluator_notes.trim()}`);
    for (const s of r.subcriteria) {
      const label = s.description ?? s.subcriteria_key;
      lines.push(
        `- ${label}: score ${s.score ?? 'n/a'} / ${s.max_points}${s.notes?.trim() ? ` · Notes: ${s.notes.trim()}` : ''}`,
      );
    }
  }
  return lines.join('\n');
}

export function buildAssessmentNarrativeUserMessage(input: {
  fund_name: string;
  manager_name: string;
  overall_score: number;
  passed: boolean;
  outcome_band: string;
  outcome_label: string;
  recommendation_label: string;
  scoring_excerpt: string;
  questionnaire_excerpt: string;
}): string {
  return [
    'Use only the information below. Output JSON as specified in the system prompt.',
    '',
    `Fund name: ${input.fund_name}`,
    `Manager name: ${input.manager_name}`,
    `Overall score (0–100): ${input.overall_score}`,
    `Pass threshold applied: 70 (passed: ${input.passed})`,
    `Outcome band (internal key): ${input.outcome_band}`,
    `Outcome label: ${input.outcome_label}`,
    `Recommendation label: ${input.recommendation_label}`,
    '',
    '--- SCORING DATA ---',
    input.scoring_excerpt,
    '',
    '--- QUESTIONNAIRE EXCERPT (selected fields) ---',
    input.questionnaire_excerpt || '(No questionnaire excerpt available.)',
  ].join('\n');
}
