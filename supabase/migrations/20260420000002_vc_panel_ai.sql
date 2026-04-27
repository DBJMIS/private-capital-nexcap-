BEGIN;

ALTER TABLE public.vc_panel_evaluations
  ADD COLUMN IF NOT EXISTS ai_recommendation jsonb,
  ADD COLUMN IF NOT EXISTS ai_recommended_at timestamptz;

COMMIT;
