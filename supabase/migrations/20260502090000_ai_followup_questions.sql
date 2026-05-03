-- AI-generated DD assessment follow-up questions for investment officer meetings

CREATE TABLE public.ai_followup_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.vc_assessments (id) ON DELETE CASCADE,
  fund_id uuid REFERENCES public.vc_portfolio_funds (id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_label text NOT NULL,
  section_score numeric,
  section_max_score numeric,
  question text NOT NULL,
  rationale text,
  used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users (id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generation_version integer NOT NULL DEFAULT 1
);

CREATE INDEX idx_ai_followup_questions_assessment_id ON public.ai_followup_questions (assessment_id);

COMMENT ON TABLE public.ai_followup_questions IS 'Claude-generated follow-up questions from weakest DD scoring sections; inserts via service role API only.';

ALTER TABLE public.ai_followup_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_followup_questions_select ON public.ai_followup_questions FOR SELECT TO authenticated USING (true);

CREATE POLICY ai_followup_questions_update ON public.ai_followup_questions FOR UPDATE TO authenticated USING (true);
