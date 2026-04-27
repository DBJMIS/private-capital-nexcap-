-- =============================================================================
-- Section VII: secured / potential investors; Section VIII: legal documents register
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.vc_dd_secured_investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  investor_name text NOT NULL,
  amount_usd numeric,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_secured_investors_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_potential_investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  investor_name text NOT NULL,
  expected_amount_usd numeric,
  timeline text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_potential_investors_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vc_dd_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  document_name text NOT NULL,
  purpose text,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'in_preparation',
      'final',
      'executed',
      'not_yet_drafted'
    )
  ),
  document_id uuid REFERENCES public.vc_dd_documents (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_legal_documents_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vc_dd_secured_investors_tenant_questionnaire
  ON public.vc_dd_secured_investors (tenant_id, questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_vc_dd_potential_investors_tenant_questionnaire
  ON public.vc_dd_potential_investors (tenant_id, questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_vc_dd_legal_documents_tenant_questionnaire
  ON public.vc_dd_legal_documents (tenant_id, questionnaire_id);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vc_dd_secured_investors',
    'vc_dd_potential_investors',
    'vc_dd_legal_documents'
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
    'vc_dd_secured_investors',
    'vc_dd_potential_investors',
    'vc_dd_legal_documents'
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

COMMENT ON TABLE public.vc_dd_secured_investors IS 'Section VII: investors with formal commitment (normalized).';
COMMENT ON TABLE public.vc_dd_potential_investors IS 'Section VII: prospective investors (normalized).';
COMMENT ON TABLE public.vc_dd_legal_documents IS 'Section VIII: legal documents register (normalized).';

COMMIT;
