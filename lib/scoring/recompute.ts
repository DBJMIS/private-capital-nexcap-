/**
 * Persist derived scores on vc_assessment_criteria and vc_assessments.
 * File path: lib/scoring/recompute.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CriteriaKey } from '@/lib/scoring/config';
import { getCriteriaDef, sectionMaxPoints } from '@/lib/scoring/config';
import { criteriaWeightedContribution } from '@/lib/scoring/calculate';

export async function recomputeCriteriaAndAssessment(
  supabase: SupabaseClient,
  tenantId: string,
  assessmentId: string,
  criteriaKey: CriteriaKey,
): Promise<{ error?: string }> {
  const def = getCriteriaDef(criteriaKey);
  if (!def) return { error: 'Unknown criteria' };

  const { data: crit } = await supabase
    .from('vc_assessment_criteria')
    .select('id, max_points, criteria_weight')
    .eq('tenant_id', tenantId)
    .eq('assessment_id', assessmentId)
    .eq('criteria_key', criteriaKey)
    .maybeSingle();

  if (!crit?.id) return { error: 'Criteria row not found' };

  const { data: subs } = await supabase
    .from('vc_assessment_subcriteria')
    .select('score, max_points')
    .eq('tenant_id', tenantId)
    .eq('criteria_id', crit.id);

  const sectionMax = sectionMaxPoints(criteriaKey);
  let raw = 0;
  let anyNull = false;
  for (const s of subs ?? []) {
    if (s.score === null || s.score === undefined) {
      anyNull = true;
      continue;
    }
    raw += Number(s.score);
  }

  const weight = Number(crit.criteria_weight);
  const weighted = anyNull
    ? null
    : criteriaWeightedContribution(raw, sectionMax, weight);

  const { error: u1 } = await supabase
    .from('vc_assessment_criteria')
    .update({
      raw_score: anyNull ? null : raw,
      weighted_score: weighted,
      max_points: sectionMax,
    })
    .eq('id', crit.id)
    .eq('tenant_id', tenantId);

  if (u1) return { error: u1.message };

  const { data: allCrit } = await supabase
    .from('vc_assessment_criteria')
    .select('weighted_score')
    .eq('tenant_id', tenantId)
    .eq('assessment_id', assessmentId);

  let overall = 0;
  let complete = true;
  for (const c of allCrit ?? []) {
    if (c.weighted_score === null || c.weighted_score === undefined) {
      complete = false;
      break;
    }
    overall += Number(c.weighted_score);
  }

  const { error: u2 } = await supabase
    .from('vc_assessments')
    .update({
      overall_score: complete ? Math.round(overall * 100) / 100 : null,
      overall_weighted_score: complete ? Math.round(overall * 100) / 100 : null,
    })
    .eq('id', assessmentId)
    .eq('tenant_id', tenantId);

  if (u2) return { error: u2.message };
  return {};
}

export async function allSubcriteriaFilled(
  supabase: SupabaseClient,
  tenantId: string,
  assessmentId: string,
): Promise<boolean> {
  const { data: critIds } = await supabase
    .from('vc_assessment_criteria')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('assessment_id', assessmentId);

  const ids = (critIds ?? []).map((c: { id: string }) => c.id);
  if (!ids.length) return false;

  const { data: subs } = await supabase
    .from('vc_assessment_subcriteria')
    .select('score')
    .eq('tenant_id', tenantId)
    .in('criteria_id', ids);

  for (const s of subs ?? []) {
    if (s.score === null || s.score === undefined) return false;
  }
  return true;
}
