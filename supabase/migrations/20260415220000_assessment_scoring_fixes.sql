-- DBJ weighted scoring: relax criteria.raw_score (was 1–5); lock completed assessments for evaluators.
BEGIN;

ALTER TABLE public.vc_assessment_criteria
  DROP CONSTRAINT IF EXISTS vc_assessment_criteria_raw_score_range;

ALTER TABLE public.vc_assessment_criteria
  ADD CONSTRAINT vc_assessment_criteria_raw_score_range CHECK (
    raw_score IS NULL OR (raw_score >= 0 AND raw_score <= max_points)
  );

ALTER TABLE public.vc_assessment_subcriteria
  DROP CONSTRAINT IF EXISTS vc_assessment_subcriteria_score_range;

ALTER TABLE public.vc_assessment_subcriteria
  ADD CONSTRAINT vc_assessment_subcriteria_score_range CHECK (
    score IS NULL OR (score >= 0 AND score <= max_points)
  );

CREATE OR REPLACE FUNCTION public.vc_can_update_assessment_row(p_assessment_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vc_assessments a
    WHERE a.id = p_assessment_id
      AND a.tenant_id = p_tenant_id
      AND (
        EXISTS (
          SELECT 1 FROM public.vc_profiles p
          WHERE p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND p.tenant_id = p_tenant_id
            AND p.role = 'admin'
        )
        OR (
          a.evaluator_id = (SELECT auth.uid())
          AND a.status NOT IN ('completed', 'approved')
        )
      )
  );
$$;

COMMENT ON FUNCTION public.vc_can_update_assessment_row(uuid, uuid) IS
  'Assessment rows: admin always; evaluator only while not completed/approved.';

COMMIT;
