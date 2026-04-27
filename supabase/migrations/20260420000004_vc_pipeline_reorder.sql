-- DBJ pipeline: additional fund_application_status enum values + pipeline_metadata for officer notes (e.g. shortlisting).
BEGIN;

ALTER TYPE public.fund_application_status ADD VALUE IF NOT EXISTS 'shortlisted';
ALTER TYPE public.fund_application_status ADD VALUE IF NOT EXISTS 'preliminary_screening';
ALTER TYPE public.fund_application_status ADD VALUE IF NOT EXISTS 'clarification_requested';
ALTER TYPE public.fund_application_status ADD VALUE IF NOT EXISTS 'site_visit';
ALTER TYPE public.fund_application_status ADD VALUE IF NOT EXISTS 'negotiation';
ALTER TYPE public.fund_application_status ADD VALUE IF NOT EXISTS 'contract_review';
ALTER TYPE public.fund_application_status ADD VALUE IF NOT EXISTS 'contract_signed';

ALTER TABLE public.vc_fund_applications
  ADD COLUMN IF NOT EXISTS pipeline_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.vc_fund_applications.pipeline_metadata IS
  'Pipeline officer data: shortlisting notes/decision, dates, etc. (JSON).';

COMMIT;
