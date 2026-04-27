-- =============================================================================
-- Due diligence structured list tables (Section I + Section II)
-- =============================================================================

BEGIN;

-- Ensure composite unique key for composite FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vc_dd_questionnaires_tenant_id_id_key'
      AND conrelid = 'public.vc_dd_questionnaires'::regclass
  ) THEN
    ALTER TABLE public.vc_dd_questionnaires
      ADD CONSTRAINT vc_dd_questionnaires_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.vc_dd_shareholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  full_name text NOT NULL,
  occupation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_shareholders_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_investment_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  full_name text NOT NULL,
  title text,
  time_dedication_pct numeric,
  notes text,
  bio_id uuid REFERENCES public.vc_dd_staff_bios (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_investment_professionals_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_dd_investment_professionals_time_pct_chk
    CHECK (time_dedication_pct IS NULL OR (time_dedication_pct >= 0 AND time_dedication_pct <= 100))
);

CREATE TABLE IF NOT EXISTS public.vc_dd_support_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  full_name text NOT NULL,
  position text,
  time_dedication_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_support_staff_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_dd_support_staff_time_pct_chk
    CHECK (time_dedication_pct IS NULL OR (time_dedication_pct >= 0 AND time_dedication_pct <= 100))
);

CREATE TABLE IF NOT EXISTS public.vc_dd_advisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  full_name text NOT NULL,
  role text,
  remuneration text,
  paid_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_advisors_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_office_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  address text NOT NULL,
  activities text,
  staff_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_office_locations_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_outsourced_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  company_name text NOT NULL,
  activities text,
  annual_cost_usd numeric,
  paid_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_outsourced_services_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_contact_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  full_name text NOT NULL,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_contact_persons_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id) ON DELETE CASCADE
);

-- updated_at triggers
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vc_dd_shareholders',
    'vc_dd_investment_professionals',
    'vc_dd_support_staff',
    'vc_dd_advisors',
    'vc_dd_office_locations',
    'vc_dd_outsourced_services',
    'vc_dd_contact_persons'
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

-- indexes
CREATE INDEX IF NOT EXISTS idx_vc_dd_shareholders_tenant_questionnaire
  ON public.vc_dd_shareholders (tenant_id, questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_vc_dd_investment_professionals_tenant_questionnaire
  ON public.vc_dd_investment_professionals (tenant_id, questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_vc_dd_support_staff_tenant_questionnaire
  ON public.vc_dd_support_staff (tenant_id, questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_vc_dd_advisors_tenant_questionnaire
  ON public.vc_dd_advisors (tenant_id, questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_vc_dd_office_locations_tenant_questionnaire
  ON public.vc_dd_office_locations (tenant_id, questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_vc_dd_outsourced_services_tenant_questionnaire
  ON public.vc_dd_outsourced_services (tenant_id, questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_vc_dd_contact_persons_tenant_questionnaire
  ON public.vc_dd_contact_persons (tenant_id, questionnaire_id);

-- RLS + tenant policies
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vc_dd_shareholders',
    'vc_dd_investment_professionals',
    'vc_dd_support_staff',
    'vc_dd_advisors',
    'vc_dd_office_locations',
    'vc_dd_outsourced_services',
    'vc_dd_contact_persons'
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

COMMENT ON TABLE public.vc_dd_shareholders IS
  'Section II sponsor structured list: shareholders and occupations.';
COMMENT ON TABLE public.vc_dd_investment_professionals IS
  'Section II sponsor structured list: investment professionals, dedication, notes, optional bio linkage.';
COMMENT ON TABLE public.vc_dd_support_staff IS
  'Section II sponsor structured list: support staff and dedication.';
COMMENT ON TABLE public.vc_dd_advisors IS
  'Section II sponsor structured list: outside advisors and committee members.';
COMMENT ON TABLE public.vc_dd_office_locations IS
  'Section II sponsor structured list: office locations and activities.';
COMMENT ON TABLE public.vc_dd_outsourced_services IS
  'Section II sponsor structured list: outsourced services and costs.';
COMMENT ON TABLE public.vc_dd_contact_persons IS
  'Section I basic-info structured list: contact persons.';

COMMIT;
