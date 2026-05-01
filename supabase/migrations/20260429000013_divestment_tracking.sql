BEGIN;

CREATE TABLE IF NOT EXISTS vc_divestments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES vc_tenants(id),
  fund_id uuid NOT NULL REFERENCES vc_portfolio_funds(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  divestment_type text NOT NULL
    CHECK (divestment_type IN ('full_exit', 'partial_exit', 'ipo', 'write_off', 'return_of_capital', 'management_buyout', 'secondary_sale')),
  announcement_date date,
  completion_date date NOT NULL,
  original_investment_amount numeric NOT NULL,
  proceeds_received numeric NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'JMD')),
  multiple_on_invested_capital numeric
    GENERATED ALWAYS AS (
      CASE
        WHEN original_investment_amount > 0 THEN proceeds_received / original_investment_amount
        ELSE NULL
      END
    ) STORED,
  is_full_exit boolean NOT NULL DEFAULT true,
  remaining_stake_pct numeric,
  exit_route text,
  notes text,
  buyer_name text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_by uuid REFERENCES vc_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divestments_fund
  ON vc_divestments(fund_id, completion_date DESC);

CREATE INDEX IF NOT EXISTS idx_divestments_tenant
  ON vc_divestments(tenant_id, completion_date DESC);

CREATE INDEX IF NOT EXISTS idx_divestments_type
  ON vc_divestments(tenant_id, divestment_type);

ALTER TABLE vc_divestments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_select" ON vc_divestments;
CREATE POLICY "tenant_isolation_select"
  ON vc_divestments FOR SELECT
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_insert" ON vc_divestments;
CREATE POLICY "tenant_isolation_insert"
  ON vc_divestments FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_update" ON vc_divestments;
CREATE POLICY "tenant_isolation_update"
  ON vc_divestments FOR UPDATE
  USING (tenant_id = get_my_tenant_id());

DROP TRIGGER IF EXISTS set_updated_at_divestments ON vc_divestments;
CREATE TRIGGER set_updated_at_divestments
  BEFORE UPDATE ON vc_divestments
  FOR EACH ROW EXECUTE FUNCTION vc_set_updated_at();

COMMIT;
