-- =============================================================================
-- Section V (Investment strategy): normalized list tables
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.vc_dd_investment_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  round_name text NOT NULL,
  min_usd numeric,
  max_usd numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_investment_rounds_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_sector_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sector_name text NOT NULL,
  max_pct numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_sector_allocations_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_geographic_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  region_country text NOT NULL,
  max_pct numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_geographic_allocations_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_investment_instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  instrument_name text NOT NULL,
  fund_pct numeric,
  legal_notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_investment_instruments_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_coinvestors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  company_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_coinvestors_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vc_dd_investment_rounds_tenant_questionnaire
  ON public.vc_dd_investment_rounds (tenant_id, questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_vc_dd_sector_allocations_tenant_questionnaire
  ON public.vc_dd_sector_allocations (tenant_id, questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_vc_dd_geographic_allocations_tenant_questionnaire
  ON public.vc_dd_geographic_allocations (tenant_id, questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_vc_dd_investment_instruments_tenant_questionnaire
  ON public.vc_dd_investment_instruments (tenant_id, questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_vc_dd_coinvestors_tenant_questionnaire
  ON public.vc_dd_coinvestors (tenant_id, questionnaire_id);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vc_dd_investment_rounds',
    'vc_dd_sector_allocations',
    'vc_dd_geographic_allocations',
    'vc_dd_investment_instruments',
    'vc_dd_coinvestors'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_set_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at()',
      t,
      t
    );
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vc_dd_investment_rounds',
    'vc_dd_sector_allocations',
    'vc_dd_geographic_allocations',
    'vc_dd_investment_instruments',
    'vc_dd_coinvestors'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_my_tenant_id()))',
      t,
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()))',
      t,
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (tenant_id = (SELECT public.get_my_tenant_id())) WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()))',
      t,
      t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated USING (tenant_id = (SELECT public.get_my_tenant_id()))',
      t,
      t
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.vc_dd_investment_rounds IS 'Section V: investment round sizing (normalized).';
COMMENT ON TABLE public.vc_dd_sector_allocations IS 'Section V: sector caps (normalized).';
COMMENT ON TABLE public.vc_dd_geographic_allocations IS 'Section V: geography caps (normalized).';
COMMENT ON TABLE public.vc_dd_investment_instruments IS 'Section V: instruments and fund % (normalized).';
COMMENT ON TABLE public.vc_dd_coinvestors IS 'Section V: co-investor contacts (normalized).';

COMMIT;
