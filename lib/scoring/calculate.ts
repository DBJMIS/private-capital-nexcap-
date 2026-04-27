/**
 * DBJ weighted scoring calculations (server + client preview).
 * File path: lib/scoring/calculate.ts
 */

import type { CriteriaKey } from '@/lib/scoring/config';
import {
  ASSESSMENT_CRITERIA,
  getCriteriaDef,
  sectionMaxPoints,
  PASS_THRESHOLD,
} from '@/lib/scoring/config';

export type SubcriteriaScoreInput = {
  key: string;
  score: number;
  notes?: string | null;
};

export type SectionScoreInput = {
  criteriaKey: CriteriaKey;
  subcriteria: SubcriteriaScoreInput[];
};

export type SectionScoreResult = {
  criteriaKey: CriteriaKey;
  sectionTotal: number;
  sectionMax: number;
  weightPercent: number;
  /** Contribution to overall 0–100 */
  weightedContribution: number;
};

export type OutcomeResult = {
  overallScore: number;
  passed: boolean;
  band: 'strong' | 'adequate' | 'weak' | 'insufficient';
  label: string;
  recommendation: 'approve' | 'review' | 'reject';
  recommendationLabel: string;
};

/**
 * Validates and sums subcriteria scores for one criteria section.
 */
export function calculateSectionScore(
  criteriaKey: CriteriaKey,
  subcriteriaScores: SubcriteriaScoreInput[],
): { sectionTotal: number; sectionMax: number; errors: string[] } {
  const def = getCriteriaDef(criteriaKey);
  if (!def) {
    return { sectionTotal: 0, sectionMax: 0, errors: ['Unknown criteria'] };
  }
  const errors: string[] = [];
  const bySub = new Map(def.subcriteria.map((s) => [s.key, s]));
  let total = 0;

  for (const row of subcriteriaScores) {
    const meta = bySub.get(row.key);
    if (!meta) {
      errors.push(`Unknown subcriteria: ${row.key}`);
      continue;
    }
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > meta.maxPoints) {
      errors.push(`${meta.label}: score must be between 0 and ${meta.maxPoints}`);
      continue;
    }
    total += row.score;
  }

  for (const sc of def.subcriteria) {
    if (!subcriteriaScores.some((r) => r.key === sc.key)) {
      errors.push(`Missing score for: ${sc.label}`);
    }
  }

  const sectionMax = sectionMaxPoints(criteriaKey);
  return { sectionTotal: total, sectionMax, errors };
}

/**
 * Weighted contribution: (sectionTotal / sectionMax) × weightPercent
 */
export function criteriaWeightedContribution(
  sectionTotal: number,
  sectionMax: number,
  weightPercent: number,
): number {
  if (sectionMax <= 0) return 0;
  return (sectionTotal / sectionMax) * weightPercent;
}

export function calculateWeightedScore(sectionScores: SectionScoreResult[]): number {
  const sum = sectionScores.reduce((s, r) => s + r.weightedContribution, 0);
  return Math.round(sum * 100) / 100;
}

export function buildSectionResults(inputs: SectionScoreInput[]): {
  sections: SectionScoreResult[];
  errors: string[];
} {
  const errors: string[] = [];
  const sections: SectionScoreResult[] = [];

  for (const c of ASSESSMENT_CRITERIA) {
    const input = inputs.find((i) => i.criteriaKey === c.key);
    if (!input) {
      errors.push(`Missing section: ${c.title}`);
      continue;
    }
    const calc = calculateSectionScore(c.key, input.subcriteria);
    errors.push(...calc.errors);
    sections.push({
      criteriaKey: c.key,
      sectionTotal: calc.sectionTotal,
      sectionMax: calc.sectionMax,
      weightPercent: c.weightPercent,
      weightedContribution: criteriaWeightedContribution(
        calc.sectionTotal,
        calc.sectionMax,
        c.weightPercent,
      ),
    });
  }

  return { sections, errors };
}

/**
 * Live overall preview (0–100): only counts sections where every subcriterion has a numeric score.
 * Incomplete sections contribute 0 to the preview total.
 */
export function previewOverallWeighted(
  states: Record<
    CriteriaKey,
    Record<string, { score: number | null; notes: string }>
  >,
): number {
  let total = 0;
  for (const c of ASSESSMENT_CRITERIA) {
    const st = states[c.key];
    if (!st) continue;
    const smax = sectionMaxPoints(c.key);
    let sum = 0;
    for (const sc of c.subcriteria) {
      const v = st[sc.key]?.score;
      if (v === null || v === undefined) {
        sum = -1;
        break;
      }
      sum += v;
    }
    if (sum < 0) continue;
    total += criteriaWeightedContribution(sum, smax, c.weightPercent);
  }
  return Math.round(total * 100) / 100;
}

export function determineOutcome(overallScore: number): OutcomeResult {
  const passed = overallScore >= PASS_THRESHOLD;
  let band: OutcomeResult['band'];
  let label: string;
  let recommendation: OutcomeResult['recommendation'];
  let recommendationLabel: string;

  if (overallScore >= 85) {
    band = 'strong';
    label = 'Strong';
    recommendation = 'approve';
    recommendationLabel = 'Recommend Approve';
  } else if (overallScore >= 70) {
    band = 'adequate';
    label = 'Adequate';
    recommendation = 'approve';
    recommendationLabel = 'Recommend Approve with Conditions';
  } else if (overallScore >= 55) {
    band = 'weak';
    label = 'Weak';
    recommendation = 'review';
    recommendationLabel = 'Recommend Review / Additional Info';
  } else {
    band = 'insufficient';
    label = 'Insufficient';
    recommendation = 'reject';
    recommendationLabel = 'Recommend Reject';
  }

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    passed,
    band,
    label,
    recommendation,
    recommendationLabel,
  };
}
