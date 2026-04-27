-- Advisory AI narrative for completed assessments (does not affect scores).
BEGIN;

ALTER TABLE public.vc_assessments
  ADD COLUMN IF NOT EXISTS ai_narrative jsonb NULL;

COMMENT ON COLUMN public.vc_assessments.ai_narrative IS
  'AI-generated advisory narrative (JSON). Label as reference-only in UI; scores are authoritative.';

-- Non-admins may only change ai_narrative when the assessment is completed or approved.
CREATE OR REPLACE FUNCTION public.vc_assessments_enforce_narrative_only_when_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.vc_profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.is_active = true
      AND p.tenant_id = NEW.tenant_id
      AND p.role = 'admin'
  ) INTO v_is_admin;

  IF OLD.status IN ('completed', 'approved') AND NOT COALESCE(v_is_admin, false) THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.questionnaire_id IS DISTINCT FROM OLD.questionnaire_id
       OR NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.overall_score IS DISTINCT FROM OLD.overall_score
       OR NEW.overall_weighted_score IS DISTINCT FROM OLD.overall_weighted_score
       OR NEW.pass_threshold IS DISTINCT FROM OLD.pass_threshold
       OR NEW.passed IS DISTINCT FROM OLD.passed
       OR NEW.recommendation IS DISTINCT FROM OLD.recommendation
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
      RAISE EXCEPTION 'completed_assessment_locked_for_evaluator'
        USING HINT = 'Only ai_narrative may be updated by evaluators after completion.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vc_assessments_enforce_narrative_only_when_complete ON public.vc_assessments;
CREATE TRIGGER trg_vc_assessments_enforce_narrative_only_when_complete
BEFORE UPDATE ON public.vc_assessments
FOR EACH ROW
EXECUTE PROCEDURE public.vc_assessments_enforce_narrative_only_when_complete();

DROP POLICY IF EXISTS vc_assessments_update_evaluator_post_completion ON public.vc_assessments;
CREATE POLICY vc_assessments_update_evaluator_post_completion ON public.vc_assessments
FOR UPDATE TO authenticated
USING (
  tenant_id = (SELECT public.get_my_tenant_id())
  AND evaluator_id = (SELECT auth.uid())
  AND status IN ('completed', 'approved')
)
WITH CHECK (
  tenant_id = (SELECT public.get_my_tenant_id())
  AND evaluator_id = (SELECT auth.uid())
);

COMMIT;
