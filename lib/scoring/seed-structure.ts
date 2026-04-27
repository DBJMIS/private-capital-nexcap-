/**
 * Build rows to seed vc_assessment_criteria + vc_assessment_subcriteria from config.
 * File path: lib/scoring/seed-structure.ts
 */

import { ASSESSMENT_CRITERIA, sectionMaxPoints, type CriteriaKey } from '@/lib/scoring/config';

export type CriteriaInsert = {
  tenant_id: string;
  assessment_id: string;
  criteria_key: CriteriaKey;
  criteria_weight: number;
  max_points: number;
};

export type SubcriteriaInsert = {
  tenant_id: string;
  criteria_id: string;
  subcriteria_key: string;
  description: string;
  max_points: number;
};

export function criteriaRowsForAssessment(tenantId: string, assessmentId: string): CriteriaInsert[] {
  return ASSESSMENT_CRITERIA.map((c) => ({
    tenant_id: tenantId,
    assessment_id: assessmentId,
    criteria_key: c.key,
    criteria_weight: c.weightPercent,
    max_points: sectionMaxPoints(c.key),
  }));
}

export function subcriteriaRowsForCriteria(
  tenantId: string,
  criteriaId: string,
  criteriaKey: CriteriaKey,
): Omit<SubcriteriaInsert, 'criteria_id'>[] {
  const c = ASSESSMENT_CRITERIA.find((x) => x.key === criteriaKey);
  if (!c) return [];
  return c.subcriteria.map((s) => ({
    tenant_id: tenantId,
    subcriteria_key: s.key,
    description: s.label,
    max_points: s.maxPoints,
  }));
}
