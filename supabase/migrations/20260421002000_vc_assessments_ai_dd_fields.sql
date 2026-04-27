-- AI DD questionnaire assessment (pre-completion scoring assist)
BEGIN;

ALTER TABLE public.vc_assessments
  ADD COLUMN IF NOT EXISTS ai_subcriteria_suggestions jsonb,
  ADD COLUMN IF NOT EXISTS ai_assessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_overall_assessment text;

COMMENT ON COLUMN public.vc_assessments.ai_subcriteria_suggestions IS
  'Structured AI suggestions (criteria/subcriteria scores, evidence, strengths/concerns) from DD questionnaire analysis.';
COMMENT ON COLUMN public.vc_assessments.ai_assessed_at IS
  'When the DD questionnaire AI assessment was last generated.';
COMMENT ON COLUMN public.vc_assessments.ai_overall_assessment IS
  'Short overall narrative from AI DD questionnaire assessment.';

COMMIT;
