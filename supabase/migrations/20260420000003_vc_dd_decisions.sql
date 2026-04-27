BEGIN;

CREATE TABLE public.vc_dd_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.vc_tenants(id) ON DELETE CASCADE,
  application_id uuid NOT NULL UNIQUE
    REFERENCES public.vc_fund_applications(id)
    ON DELETE CASCADE,

  ai_recommendation jsonb,
  ai_recommended_at timestamptz,
  ai_weighted_score numeric(4,2),

  strong_points text,
  weak_points text,
  conditions text,
  rejection_reason text,

  final_decision text CHECK (final_decision IN (
    'full_dd', 'conditional_dd', 'no_dd'
  )),
  decision_overrides_ai boolean NOT NULL DEFAULT false,
  decided_by uuid REFERENCES auth.users(id)
    ON DELETE SET NULL,
  decider_name text,
  decided_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_vc_dd_decisions_updated_at
  BEFORE UPDATE ON public.vc_dd_decisions
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_dd_decisions_tenant_application
  ON public.vc_dd_decisions(tenant_id, application_id);

ALTER TABLE public.vc_dd_decisions
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_dd_decisions_select
  ON public.vc_dd_decisions
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY vc_dd_decisions_insert
  ON public.vc_dd_decisions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY vc_dd_decisions_update
  ON public.vc_dd_decisions
  FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

COMMIT;
