-- Epic 3: site visit enhancements, contracts, commitments, application document storage
BEGIN;

-- ---------------------------------------------------------------------------
-- Align vc_site_visits with Epic 3 (composite FK, DBJ attendees, legal review)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_site_visits'
      AND column_name = 'attendees'
  ) THEN
    ALTER TABLE public.vc_site_visits RENAME COLUMN attendees TO dbj_attendees;
  END IF;
END $$;

ALTER TABLE public.vc_site_visits
  ADD COLUMN IF NOT EXISTS legal_docs_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_docs_notes text,
  ADD COLUMN IF NOT EXISTS report_file_name text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome_notes text;

ALTER TABLE public.vc_site_visits
  ALTER COLUMN dbj_attendees SET DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vc_site_visits_conducted_by_fkey'
  ) THEN
    ALTER TABLE public.vc_site_visits DROP CONSTRAINT vc_site_visits_conducted_by_fkey;
  END IF;
END $$;

ALTER TABLE public.vc_site_visits DROP CONSTRAINT IF EXISTS vc_site_visits_conducted_by_profile_fk;

UPDATE public.vc_site_visits sv
SET conducted_by = p.id
FROM public.vc_profiles p
WHERE sv.tenant_id = p.tenant_id
  AND sv.conducted_by IS NOT NULL
  AND p.user_id = sv.conducted_by;

UPDATE public.vc_site_visits sv
SET conducted_by = NULL
WHERE conducted_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.vc_profiles p WHERE p.id = sv.conducted_by);

ALTER TABLE public.vc_site_visits
  ADD CONSTRAINT vc_site_visits_conducted_by_profile_fk
  FOREIGN KEY (conducted_by) REFERENCES public.vc_profiles (id) ON DELETE SET NULL;

ALTER TABLE public.vc_site_visits DROP CONSTRAINT IF EXISTS vc_site_visits_application_id_fkey;
ALTER TABLE public.vc_site_visits DROP CONSTRAINT IF EXISTS vc_site_visits_application_fk;

ALTER TABLE public.vc_site_visits
  ADD CONSTRAINT vc_site_visits_application_fk
  FOREIGN KEY (tenant_id, application_id)
  REFERENCES public.vc_fund_applications (tenant_id, id)
  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,

  contract_type text NOT NULL DEFAULT 'management_agreement'
    CHECK (
      contract_type IN (
        'management_agreement',
        'subscription_agreement',
        'side_letter',
        'other'
      )
    ),

  status text NOT NULL DEFAULT 'drafting'
    CHECK (
      status IN (
        'drafting',
        'under_negotiation',
        'legal_review',
        'pending_signature',
        'signed',
        'executed'
      )
    ),

  commitment_amount numeric,
  commitment_currency text NOT NULL DEFAULT 'JMD',
  dbj_pro_rata_pct numeric,
  management_fee_pct numeric,
  carried_interest_pct numeric,
  hurdle_rate_pct numeric,
  fund_life_years integer,
  investment_period_years integer,

  legal_review_started_at timestamptz,
  legal_review_completed_at timestamptz,
  legal_reviewer_notes text,

  adobe_sign_agreement_id text,
  adobe_sign_status text,
  signed_at timestamptz,
  signed_by_dbj text,
  signed_by_fund_manager text,

  contract_file_path text,
  contract_file_name text,

  negotiation_rounds jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vc_contracts_application_fk
    FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vc_contracts_application
  ON public.vc_contracts (tenant_id, application_id);

CREATE TRIGGER trg_vc_contracts_updated_at
  BEFORE UPDATE ON public.vc_contracts
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

ALTER TABLE public.vc_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_contracts_select ON public.vc_contracts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_contracts_insert ON public.vc_contracts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_contracts_update ON public.vc_contracts
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

-- ---------------------------------------------------------------------------
-- Commitments (activates fund for monitoring)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  contract_id uuid REFERENCES public.vc_contracts (id) ON DELETE SET NULL,

  fund_name text NOT NULL,
  manager_name text NOT NULL,
  fund_representative text,

  commitment_amount numeric NOT NULL,
  commitment_currency text NOT NULL DEFAULT 'JMD',
  dbj_pro_rata_pct numeric NOT NULL,

  fund_year_end_month integer,
  listed boolean NOT NULL DEFAULT false,

  quarterly_report_due_days integer NOT NULL DEFAULT 45,
  audit_report_due_days integer NOT NULL DEFAULT 90,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'written_off')),

  committed_at date NOT NULL DEFAULT CURRENT_DATE,
  first_drawdown_date date,
  fund_close_date date,

  created_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vc_commitments_application_fk
    FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vc_commitments_application
  ON public.vc_commitments (tenant_id, application_id);

CREATE INDEX IF NOT EXISTS idx_vc_commitments_status
  ON public.vc_commitments (tenant_id, status);

CREATE TRIGGER trg_vc_commitments_updated_at
  BEFORE UPDATE ON public.vc_commitments
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

ALTER TABLE public.vc_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_commitments_select ON public.vc_commitments
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_commitments_insert ON public.vc_commitments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_commitments_update ON public.vc_commitments
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

-- ---------------------------------------------------------------------------
-- Storage: application documents (site visit reports, contracts)
-- Path: {tenant_id}/applications/{application_id}/...
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'application-documents',
  'application-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS application_documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS application_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS application_documents_storage_update ON storage.objects;
DROP POLICY IF EXISTS application_documents_storage_delete ON storage.objects;

CREATE POLICY application_documents_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'application-documents'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id ())::text
  );

CREATE POLICY application_documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'application-documents'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id ())::text
    AND (SELECT public.get_my_tenant_id ()) IS NOT NULL
  );

CREATE POLICY application_documents_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'application-documents'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id ())::text
  );

CREATE POLICY application_documents_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'application-documents'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id ())::text
  );

COMMIT;
