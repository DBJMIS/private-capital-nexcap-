-- Investment professionals: remove per-row notes; add position status and hire timeline for vacant rows.
-- File: supabase/migrations/20260417000002_vc_dd_professionals_cleanup.sql

ALTER TABLE public.vc_dd_investment_professionals
  DROP COLUMN IF EXISTS notes;

ALTER TABLE public.vc_dd_investment_professionals
  ADD COLUMN IF NOT EXISTS position_status text NOT NULL DEFAULT 'full_time';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vc_dd_investment_professionals_position_status_chk'
  ) THEN
    ALTER TABLE public.vc_dd_investment_professionals
      ADD CONSTRAINT vc_dd_investment_professionals_position_status_chk
      CHECK (position_status IN ('full_time', 'part_time', 'vacant'));
  END IF;
END $$;

ALTER TABLE public.vc_dd_investment_professionals
  ADD COLUMN IF NOT EXISTS hire_timeline text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vc_dd_investment_professionals_hire_timeline_chk'
  ) THEN
    ALTER TABLE public.vc_dd_investment_professionals
      ADD CONSTRAINT vc_dd_investment_professionals_hire_timeline_chk
      CHECK (
        hire_timeline IS NULL
        OR hire_timeline IN ('immediate', 'within_6_months', 'within_1_year')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.vc_dd_investment_professionals.position_status IS
  'full_time | part_time | vacant — distinguishes filled roles from intended hires.';
COMMENT ON COLUMN public.vc_dd_investment_professionals.hire_timeline IS
  'For vacant positions only: immediate | within_6_months | within_1_year.';
