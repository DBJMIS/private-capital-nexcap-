-- Epic 5: Capital calls & drawdown notices (DBJ share per fund, native currency)
BEGIN;

-- ---------------------------------------------------------------------------
-- Capital calls (one row per notice)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_capital_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.vc_portfolio_funds (id) ON DELETE CASCADE,

  notice_number integer NOT NULL,
  date_of_notice date NOT NULL,
  due_date date,
  date_paid date,

  call_amount numeric NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'JMD')),

  total_called_to_date numeric,
  remaining_commitment numeric,

  status text NOT NULL DEFAULT 'unpaid'
    CHECK (
      status IN (
        'unpaid',
        'paid',
        'partial',
        'overdue',
        'cancelled'
      )
    ),

  notes text,

  created_by uuid REFERENCES public.vc_profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Capital call line items (purposes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_capital_call_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  capital_call_id uuid NOT NULL REFERENCES public.vc_capital_calls (id) ON DELETE CASCADE,

  purpose_category text NOT NULL
    CHECK (
      purpose_category IN (
        'management_fee',
        'organisation_expenses',
        'administration_fee',
        'legal_fees',
        'director_fees',
        'regulatory_expenses',
        'other_fees',
        'investment'
      )
    ),

  investee_company text,
  description text,

  amount numeric NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'JMD')),

  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capital_calls_fund ON public.vc_capital_calls (fund_id, notice_number);

CREATE INDEX IF NOT EXISTS idx_capital_calls_tenant ON public.vc_capital_calls (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_capital_call_items_call ON public.vc_capital_call_items (capital_call_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_capital_call_notice ON public.vc_capital_calls (fund_id, notice_number);

ALTER TABLE public.vc_capital_calls ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vc_capital_call_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_capital_calls_select ON public.vc_capital_calls FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_capital_calls_insert ON public.vc_capital_calls FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_capital_calls_update ON public.vc_capital_calls FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_capital_calls_delete ON public.vc_capital_calls FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_capital_call_items_select ON public.vc_capital_call_items FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_capital_call_items_insert ON public.vc_capital_call_items FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_capital_call_items_update ON public.vc_capital_call_items FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE POLICY vc_capital_call_items_delete ON public.vc_capital_call_items FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id ());

CREATE TRIGGER trg_vc_capital_calls_updated_at
  BEFORE UPDATE ON public.vc_capital_calls
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

CREATE TRIGGER trg_vc_capital_call_items_updated_at
  BEFORE UPDATE ON public.vc_capital_call_items
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at ();

COMMIT;
