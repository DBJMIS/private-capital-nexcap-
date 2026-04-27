-- Epic 13 Stage 1: auto-derived assessment engine
BEGIN;

ALTER TABLE public.vc_quarterly_assessments
  ADD COLUMN IF NOT EXISTS dimension_reasoning jsonb,
  ADD COLUMN IF NOT EXISTS dimension_overrides jsonb,
  ADD COLUMN IF NOT EXISTS source_snippets jsonb,
  ADD COLUMN IF NOT EXISTS narrative_extract_id uuid;

CREATE TABLE IF NOT EXISTS public.vc_fund_narrative_extracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds(id) ON DELETE CASCADE,
  source_obligation_id uuid REFERENCES public.vc_reporting_obligations(id) ON DELETE SET NULL,
  period_year integer,
  period_quarter integer,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  extraction_confidence jsonb,
  fundraising_update text,
  pipeline_development text,
  team_update text,
  compliance_update text,
  impact_update text,
  risk_assessment text,
  outlook text,
  indicators jsonb,
  source_snippets jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_vc_fund_narrative_extracts_source UNIQUE (tenant_id, fund_id, source_obligation_id)
);

CREATE INDEX IF NOT EXISTS idx_vc_fund_narrative_extracts_tenant_fund_period
  ON public.vc_fund_narrative_extracts (tenant_id, fund_id, period_year, period_quarter);

CREATE TRIGGER trg_vc_fund_narrative_extracts_updated_at
  BEFORE UPDATE ON public.vc_fund_narrative_extracts
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

ALTER TABLE public.vc_fund_narrative_extracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_fund_narrative_extracts_select ON public.vc_fund_narrative_extracts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY vc_fund_narrative_extracts_insert ON public.vc_fund_narrative_extracts
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_fund_narrative_extracts_update ON public.vc_fund_narrative_extracts
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_fund_narrative_extracts_delete ON public.vc_fund_narrative_extracts
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.vc_is_admin()
  );

ALTER TABLE public.vc_quarterly_assessments
  ADD CONSTRAINT fk_narrative_extract
  FOREIGN KEY (narrative_extract_id)
  REFERENCES public.vc_fund_narrative_extracts(id) ON DELETE SET NULL;

COMMIT;
