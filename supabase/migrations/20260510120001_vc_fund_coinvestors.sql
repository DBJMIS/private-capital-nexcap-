-- Co-investors linked to portfolio funds (tenant-scoped)
BEGIN;

CREATE TABLE IF NOT EXISTS public.vc_fund_coinvestors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds (id) ON DELETE CASCADE,
  investor_name text NOT NULL,
  investor_type text
    CHECK (
      investor_type IS NULL
      OR investor_type IN (
        'DFI',
        'Commercial Bank',
        'Pension Fund',
        'Insurance Company',
        'Family Office',
        'Private Equity',
        'Government',
        'Other'
      )
    ),
  investor_country text,
  commitment_amount numeric,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'JMD')),
  commitment_date date,
  notes text,
  created_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS idx_coinvestors_fund_id ON public.vc_fund_coinvestors (fund_id);

CREATE INDEX IF NOT EXISTS idx_coinvestors_tenant_id ON public.vc_fund_coinvestors (tenant_id);

ALTER TABLE public.vc_fund_coinvestors ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_fund_coinvestors_select ON public.vc_fund_coinvestors FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_fund_coinvestors_insert ON public.vc_fund_coinvestors FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_fund_coinvestors_update ON public.vc_fund_coinvestors FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ())
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_fund_coinvestors_delete ON public.vc_fund_coinvestors FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE TRIGGER trg_vc_fund_coinvestors_updated_at
  BEFORE UPDATE ON public.vc_fund_coinvestors
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

COMMIT;
