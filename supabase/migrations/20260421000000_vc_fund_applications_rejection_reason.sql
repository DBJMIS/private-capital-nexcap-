-- Ensures rejection_reason exists on fund applications (idempotent).
-- Some environments may not have applied 20260416120000_evaluation_flow_assessment_columns.sql.
BEGIN;

ALTER TABLE public.vc_fund_applications
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN public.vc_fund_applications.rejection_reason IS 'Staff or system rejection explanation shown to the fund manager.';

COMMIT;
