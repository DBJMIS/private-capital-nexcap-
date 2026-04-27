/**
 * Rule-based assessment insights (strengths / weaknesses / red flags).
 * File path: lib/scoring/insights.ts
 */

import type { CriteriaKey } from '@/lib/scoring/config';
import { getCriteriaDef, sectionMaxPoints } from '@/lib/scoring/config';

export type AssessmentInsightInput = {
  criteriaKey: CriteriaKey;
  sectionTotal: number;
  sectionMax: number;
};

export type AssessmentInsights = {
  strengths: string[];
  weaknesses: string[];
  red_flags: string[];
};

function ratio(total: number, max: number): number {
  if (max <= 0) return 0;
  return total / max;
}

/**
 * Rule-based insights from section-level scores.
 */
export function generateInsights(sections: AssessmentInsightInput[]): AssessmentInsights {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const red_flags: string[] = [];

  for (const s of sections) {
    const def = getCriteriaDef(s.criteriaKey);
    const title = def?.title ?? s.criteriaKey;
    const r = ratio(s.sectionTotal, s.sectionMax);
    if (r >= 0.8) {
      strengths.push(`${title}: scored at ${Math.round(r * 100)}% of section maximum — solid signal.`);
    }
    if (r < 0.6) {
      weaknesses.push(`${title}: scored at ${Math.round(r * 100)}% of section maximum — below typical adequacy.`);
    }
  }

  const pick = (key: CriteriaKey) => sections.find((x) => x.criteriaKey === key);
  const gov = pick('governance');
  const team = pick('team');
  const fr = pick('fundraising');

  if (gov && ratio(gov.sectionTotal, gov.sectionMax) < 0.5) {
    red_flags.push('Governance scored below 50% of maximum — elevated governance risk.');
  }
  if (team && ratio(team.sectionTotal, team.sectionMax) < 0.5) {
    red_flags.push('Team scored below 50% of maximum — team depth or commitment may be insufficient.');
  }
  if (fr && ratio(fr.sectionTotal, fr.sectionMax) < 0.4) {
    red_flags.push('Fundraising scored below 40% of maximum — capital formation risk is high.');
  }

  return { strengths, weaknesses, red_flags };
}

/** Build insight inputs from DB-like rows */
export function insightInputsFromScores(
  rows: { criteria_key: string; raw_score: number | null; max_points: number | null }[],
): AssessmentInsightInput[] {
  return rows
    .filter((r) => r.raw_score != null && r.max_points != null)
    .map((r) => ({
      criteriaKey: r.criteria_key as CriteriaKey,
      sectionTotal: Number(r.raw_score),
      sectionMax: Number(r.max_points) || sectionMaxPoints(r.criteria_key as CriteriaKey),
    }));
}
