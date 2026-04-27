-- Epic 4: portfolio fund master + reporting obligations + storage
BEGIN;

-- ---------------------------------------------------------------------------
-- Portfolio funds (post-commitment monitoring)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_portfolio_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  application_id uuid,
  commitment_id uuid REFERENCES public.vc_commitments (id) ON DELETE SET NULL,

  fund_name text NOT NULL,
  manager_name text NOT NULL,
  fund_representative text,
  manager_email text,
  manager_phone text,

  currency text NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('USD', 'JMD')),
  total_fund_commitment numeric NOT NULL,
  dbj_commitment numeric NOT NULL,
  dbj_pro_rata_pct numeric NOT NULL,

  listed boolean NOT NULL DEFAULT false,
  fund_status text NOT NULL DEFAULT 'active'
    CHECK (
      fund_status IN (
        'active',
        'closed',
        'wind_down',
        'written_off'
      )
    ),

  year_end_month integer NOT NULL
    CHECK (
      year_end_month BETWEEN 1 AND 12
    ),

  quarterly_report_due_days integer NOT NULL DEFAULT 45,
  audit_report_due_days integer NOT NULL DEFAULT 90,

  requires_quarterly_financial boolean NOT NULL DEFAULT true,
  requires_quarterly_inv_mgmt boolean NOT NULL DEFAULT true,
  requires_audited_annual boolean NOT NULL DEFAULT true,
  requires_inhouse_quarterly boolean NOT NULL DEFAULT true,

  report_months integer[] NOT NULL DEFAULT ARRAY[3, 6, 9, 12]::integer[],
  audit_month integer NOT NULL DEFAULT 9,

  exchange_rate_jmd_usd numeric DEFAULT 157.00,

  commitment_date date NOT NULL,
  fund_close_date date,
  fund_life_years integer,
  investment_period_years integer,

  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,

  created_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vc_portfolio_funds_application_fk
    FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_portfolio_funds_tenant
  ON public.vc_portfolio_funds (tenant_id);

CREATE INDEX IF NOT EXISTS idx_portfolio_funds_status
  ON public.vc_portfolio_funds (tenant_id, fund_status);

CREATE TRIGGER trg_vc_portfolio_funds_updated_at
  BEFORE UPDATE ON public.vc_portfolio_funds
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

ALTER TABLE public.vc_portfolio_funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_portfolio_funds_select ON public.vc_portfolio_funds
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_portfolio_funds_insert ON public.vc_portfolio_funds
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_portfolio_funds_update ON public.vc_portfolio_funds
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

-- ---------------------------------------------------------------------------
-- Reporting obligations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_reporting_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds (id) ON DELETE CASCADE,

  report_type text NOT NULL
    CHECK (
      report_type IN (
        'quarterly_financial',
        'quarterly_investment_mgmt',
        'audited_annual',
        'inhouse_quarterly'
      )
    ),

  period_year integer NOT NULL,
  period_month integer NOT NULL
    CHECK (
      period_month BETWEEN 1 AND 12
    ),

  period_label text NOT NULL,

  due_date date NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'due',
        'submitted',
        'under_review',
        'accepted',
        'outstanding',
        'overdue',
        'waived'
      )
    ),

  submitted_date date,
  submitted_by text,

  reviewed_date date,
  reviewed_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  review_notes text,

  document_path text,
  document_name text,
  document_size_bytes bigint,

  days_overdue integer NOT NULL DEFAULT 0,

  reminder_sent_at timestamptz,
  escalated_at timestamptz,
  escalation_level text CHECK (
    escalation_level IN (
      'analyst',
      'supervisor',
      'unit_head'
    )
  ),

  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now (),

  CONSTRAINT uq_reporting_obligation UNIQUE (fund_id, report_type, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_reporting_obligations_fund
  ON public.vc_reporting_obligations (fund_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_reporting_obligations_status
  ON public.vc_reporting_obligations (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_reporting_obligations_due
  ON public.vc_reporting_obligations (tenant_id, due_date);

CREATE TRIGGER trg_vc_reporting_obligations_updated_at
  BEFORE UPDATE ON public.vc_reporting_obligations
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

ALTER TABLE public.vc_reporting_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_reporting_obligations_select ON public.vc_reporting_obligations
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_reporting_obligations_insert ON public.vc_reporting_obligations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_reporting_obligations_update ON public.vc_reporting_obligations
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

-- ---------------------------------------------------------------------------
-- Storage: portfolio report documents
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-reports',
  'portfolio-reports',
  false,
  52428800,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY portfolio_reports_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'portfolio-reports'
    AND split_part(name, '/', 1) = public.get_my_tenant_id ()::text
  );

CREATE POLICY portfolio_reports_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio-reports'
    AND split_part(name, '/', 1) = public.get_my_tenant_id ()::text
  );

CREATE POLICY portfolio_reports_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portfolio-reports'
    AND split_part(name, '/', 1) = public.get_my_tenant_id ()::text
  );

CREATE POLICY portfolio_reports_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio-reports'
    AND split_part(name, '/', 1) = public.get_my_tenant_id ()::text
  );

COMMIT;
