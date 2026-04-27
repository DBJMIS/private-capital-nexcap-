-- Optional extended fields + AI onboarding state for vc_fund_applications
BEGIN;

ALTER TABLE public.vc_fund_applications
  ADD COLUMN IF NOT EXISTS onboarding_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.vc_fund_applications.onboarding_metadata IS
  'AI onboarding: investment_stage, primary_sector, fund_life_years, investment_period_years, intro, chat summary, etc.';

COMMIT;
