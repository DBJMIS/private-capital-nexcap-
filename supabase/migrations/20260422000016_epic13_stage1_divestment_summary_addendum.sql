-- Epic 13 Stage 1 addendum: divestment assessment summary support
BEGIN;

ALTER TABLE public.vc_quarterly_assessments
  ADD COLUMN IF NOT EXISTS investment_stage text,
  ADD COLUMN IF NOT EXISTS dd_assessment_id uuid REFERENCES public.vc_assessments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dd_outcome_at_commitment text;

COMMIT;
