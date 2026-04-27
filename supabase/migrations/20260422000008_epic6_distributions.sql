BEGIN;

-- ---------------------------------------------------------------------------
-- Distributions & dividends (one record per distribution event per fund)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants(id),
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds(id) ON DELETE CASCADE,

  distribution_number integer NOT NULL,
  distribution_date date NOT NULL,

  return_type text NOT NULL
    CHECK (return_type IN ('dividend', 'return_of_capital', 'capital_gain', 'interest', 'other')),

  amount numeric NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'JMD')),

  units numeric,
  per_unit_amount numeric,

  cumulative_total numeric,

  source_company text,
  notes text,
  reference_number text,

  created_by uuid REFERENCES public.vc_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_distributions_fund
  ON public.vc_distributions(fund_id, distribution_number);

CREATE INDEX IF NOT EXISTS idx_distributions_tenant
  ON public.vc_distributions(tenant_id, distribution_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_distribution_number
  ON public.vc_distributions(fund_id, distribution_number);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.vc_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select"
  ON public.vc_distributions FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_isolation_insert"
  ON public.vc_distributions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_isolation_update"
  ON public.vc_distributions FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_isolation_delete"
  ON public.vc_distributions FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_distributions ON public.vc_distributions;
CREATE TRIGGER set_updated_at_distributions
  BEFORE UPDATE ON public.vc_distributions
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

COMMIT;
