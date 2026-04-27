-- AI scoring + staff overrides on criteria rows; application rejection reason
BEGIN;

ALTER TABLE public.vc_assessment_criteria
  ADD COLUMN IF NOT EXISTS ai_reasoning text,
  ADD COLUMN IF NOT EXISTS override_score numeric,
  ADD COLUMN IF NOT EXISTS override_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason text;

ALTER TABLE public.vc_assessment_criteria
  DROP CONSTRAINT IF EXISTS vc_assessment_criteria_override_score_range;

ALTER TABLE public.vc_assessment_criteria
  ADD CONSTRAINT vc_assessment_criteria_override_score_range CHECK (
    override_score IS NULL OR (override_score >= 1 AND override_score <= 5)
  );

ALTER TABLE public.vc_fund_applications
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN public.vc_assessment_criteria.ai_reasoning IS 'Claude-generated rationale for the criterion score.';
COMMENT ON COLUMN public.vc_fund_applications.rejection_reason IS 'Staff or system rejection explanation shown to the fund manager.';

COMMIT;
