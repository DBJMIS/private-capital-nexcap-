-- =============================================================================
-- Section III (Deal flow): pipeline companies (normalized table)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.vc_dd_pipeline_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  questionnaire_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  company_name text NOT NULL,
  sector text,
  investment_amount_usd numeric,
  annual_sales_usd numeric,
  leverage text,
  equity_pct numeric,
  negotiation_status text,
  exit_type text,
  exit_notes text,
  investment_thesis text,
  deal_structure_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_dd_pipeline_companies_questionnaire_fk
    FOREIGN KEY (tenant_id, questionnaire_id)
    REFERENCES public.vc_dd_questionnaires (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT vc_dd_pipeline_companies_negotiation_chk
    CHECK (
      negotiation_status IS NULL
      OR negotiation_status IN (
        'initial_contact',
        'in_discussion',
        'term_sheet',
        'due_diligence',
        'agreed'
      )
    ),
  CONSTRAINT vc_dd_pipeline_companies_exit_type_chk
    CHECK (
      exit_type IS NULL
      OR exit_type IN ('ipo', 'trade_sale', 'strategic_acquirer', 'mbo_mbi', 'other')
    ),
  CONSTRAINT vc_dd_pipeline_companies_equity_chk
    CHECK (equity_pct IS NULL OR (equity_pct >= 0 AND equity_pct <= 100))
);

CREATE INDEX IF NOT EXISTS idx_vc_dd_pipeline_companies_tenant_questionnaire
  ON public.vc_dd_pipeline_companies (tenant_id, questionnaire_id);

ALTER TABLE public.vc_dd_pipeline_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vc_dd_pipeline_companies_select ON public.vc_dd_pipeline_companies;
CREATE POLICY vc_dd_pipeline_companies_select ON public.vc_dd_pipeline_companies FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

DROP POLICY IF EXISTS vc_dd_pipeline_companies_insert ON public.vc_dd_pipeline_companies;
CREATE POLICY vc_dd_pipeline_companies_insert ON public.vc_dd_pipeline_companies FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

DROP POLICY IF EXISTS vc_dd_pipeline_companies_update ON public.vc_dd_pipeline_companies;
CREATE POLICY vc_dd_pipeline_companies_update ON public.vc_dd_pipeline_companies FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

DROP POLICY IF EXISTS vc_dd_pipeline_companies_delete ON public.vc_dd_pipeline_companies;
CREATE POLICY vc_dd_pipeline_companies_delete ON public.vc_dd_pipeline_companies FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

COMMENT ON TABLE public.vc_dd_pipeline_companies IS
  'Section III deal flow: pipeline companies (modal-managed).';

COMMIT;
