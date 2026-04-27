-- Epic 13: quarterly assessment scoring, config, watchlist
BEGIN;

CREATE TABLE IF NOT EXISTS public.vc_assessment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  weight_financial_performance numeric(5, 2) NOT NULL DEFAULT 30.00,
  weight_development_impact numeric(5, 2) NOT NULL DEFAULT 25.00,
  weight_fund_management numeric(5, 2) NOT NULL DEFAULT 20.00,
  weight_compliance_governance numeric(5, 2) NOT NULL DEFAULT 15.00,
  weight_portfolio_health numeric(5, 2) NOT NULL DEFAULT 10.00,
  lifecycle_early_financial_adj numeric(5, 2) NOT NULL DEFAULT -10.00,
  lifecycle_early_management_adj numeric(5, 2) NOT NULL DEFAULT 10.00,
  lifecycle_late_financial_adj numeric(5, 2) NOT NULL DEFAULT 10.00,
  lifecycle_late_impact_adj numeric(5, 2) NOT NULL DEFAULT -10.00,
  threshold_strong numeric(5, 2) NOT NULL DEFAULT 70.00,
  threshold_adequate numeric(5, 2) NOT NULL DEFAULT 50.00,
  threshold_watchlist numeric(5, 2) NOT NULL DEFAULT 30.00,
  watchlist_escalation_quarters integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now (),
  CONSTRAINT uq_vc_assessment_config_tenant UNIQUE (tenant_id)
);

CREATE TRIGGER trg_vc_assessment_config_updated_at
  BEFORE UPDATE ON public.vc_assessment_config
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

ALTER TABLE public.vc_assessment_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_assessment_config_select ON public.vc_assessment_config
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_assessment_config_insert ON public.vc_assessment_config
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_is_admin ()
  );

CREATE POLICY vc_assessment_config_update ON public.vc_assessment_config
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_is_admin ()
  );

CREATE POLICY vc_assessment_config_delete ON public.vc_assessment_config
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_is_admin ()
  );

CREATE TABLE IF NOT EXISTS public.vc_quarterly_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds (id) ON DELETE CASCADE,
  assessment_date date NOT NULL,
  assessment_period text NOT NULL,
  fund_lifecycle_stage text NOT NULL,
  financial_performance_score numeric(5, 2),
  development_impact_score numeric(5, 2),
  fund_management_score numeric(5, 2),
  compliance_governance_score numeric(5, 2),
  portfolio_health_score numeric(5, 2),
  weighted_total_score numeric(5, 2),
  category text,
  divestment_recommendation text,
  contractual_obligation boolean NOT NULL DEFAULT false,
  recommendation_override_reason text,
  financial_commentary text,
  impact_commentary text,
  management_commentary text,
  compliance_commentary text,
  portfolio_commentary text,
  overall_summary text,
  ai_summary text,
  ai_generated_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  assessed_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now (),
  CONSTRAINT uq_vc_quarterly_assessments_period UNIQUE (tenant_id, fund_id, assessment_period)
);

CREATE INDEX IF NOT EXISTS idx_vc_quarterly_assessments_tenant_fund_date
  ON public.vc_quarterly_assessments (tenant_id, fund_id, assessment_date DESC);

CREATE TRIGGER trg_vc_quarterly_assessments_updated_at
  BEFORE UPDATE ON public.vc_quarterly_assessments
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

ALTER TABLE public.vc_quarterly_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_quarterly_assessments_select ON public.vc_quarterly_assessments
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_quarterly_assessments_insert ON public.vc_quarterly_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_can_write_standard ()
  );

CREATE POLICY vc_quarterly_assessments_update ON public.vc_quarterly_assessments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_can_write_standard ()
  );

CREATE POLICY vc_quarterly_assessments_delete ON public.vc_quarterly_assessments
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_is_admin ()
  );

CREATE TABLE IF NOT EXISTS public.vc_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds (id) ON DELETE CASCADE,
  placed_on_watchlist date NOT NULL,
  consecutive_quarters integer NOT NULL DEFAULT 1,
  last_assessment_id uuid REFERENCES public.vc_quarterly_assessments (id) ON DELETE SET NULL,
  escalated boolean NOT NULL DEFAULT false,
  escalated_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now (),
  CONSTRAINT uq_vc_watchlist_fund UNIQUE (fund_id)
);

CREATE INDEX IF NOT EXISTS idx_vc_watchlist_tenant_fund
  ON public.vc_watchlist (tenant_id, fund_id);

CREATE TRIGGER trg_vc_watchlist_updated_at
  BEFORE UPDATE ON public.vc_watchlist
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

ALTER TABLE public.vc_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_watchlist_select ON public.vc_watchlist
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_watchlist_insert ON public.vc_watchlist
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_can_write_standard ()
  );

CREATE POLICY vc_watchlist_update ON public.vc_watchlist
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_can_write_standard ()
  );

-- Writers must be able to remove a fund from the watchlist when an approved assessment recommends hold/monitor.
CREATE POLICY vc_watchlist_delete ON public.vc_watchlist
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_can_write_standard ()
  );

INSERT INTO public.vc_assessment_config (
  tenant_id,
  weight_financial_performance,
  weight_development_impact,
  weight_fund_management,
  weight_compliance_governance,
  weight_portfolio_health,
  lifecycle_early_financial_adj,
  lifecycle_early_management_adj,
  lifecycle_late_financial_adj,
  lifecycle_late_impact_adj,
  threshold_strong,
  threshold_adequate,
  threshold_watchlist,
  watchlist_escalation_quarters
)
VALUES (
  '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1',
  30.00,
  25.00,
  20.00,
  15.00,
  10.00,
  -10.00,
  10.00,
  10.00,
  -10.00,
  70.00,
  50.00,
  30.00,
  2
)
ON CONFLICT (tenant_id) DO NOTHING;

COMMIT;
