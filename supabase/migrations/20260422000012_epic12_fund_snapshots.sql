-- Epic 12: quarterly fund performance snapshots (NAV, flows, reported IRR)
BEGIN;

CREATE TABLE IF NOT EXISTS public.vc_fund_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds (id) ON DELETE CASCADE,

  period_year integer NOT NULL
    CHECK (
      period_year BETWEEN 2000 AND 2100
    ),
  period_quarter integer NOT NULL
    CHECK (
      period_quarter BETWEEN 1 AND 4
    ),

  snapshot_date date NOT NULL,

  nav numeric NOT NULL,
  committed_capital numeric,
  distributions_in_period numeric DEFAULT 0,

  reported_irr numeric,
  investor_remark text,

  created_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now (),

  CONSTRAINT uq_vc_fund_snapshots_fund_period UNIQUE (fund_id, period_year, period_quarter)
);

CREATE INDEX IF NOT EXISTS idx_vc_fund_snapshots_tenant_fund
  ON public.vc_fund_snapshots (tenant_id, fund_id);

CREATE INDEX IF NOT EXISTS idx_vc_fund_snapshots_fund_date
  ON public.vc_fund_snapshots (fund_id, snapshot_date DESC);

CREATE TRIGGER trg_vc_fund_snapshots_updated_at
  BEFORE UPDATE ON public.vc_fund_snapshots
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

ALTER TABLE public.vc_fund_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_fund_snapshots_select ON public.vc_fund_snapshots
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_fund_snapshots_insert ON public.vc_fund_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_can_write_standard ()
  );

CREATE POLICY vc_fund_snapshots_update ON public.vc_fund_snapshots
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_can_write_standard ()
  );

CREATE POLICY vc_fund_snapshots_delete ON public.vc_fund_snapshots
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id ()
    AND public.vc_is_admin ()
  );

COMMIT;
