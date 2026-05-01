BEGIN;

-- Obligation filters used on fund detail/reporting tabs.
CREATE INDEX IF NOT EXISTS idx_reporting_obligations_fund_period_status
  ON public.vc_reporting_obligations (fund_id, period_year, status);

-- Direct tenant scans on obligations.
CREATE INDEX IF NOT EXISTS idx_reporting_obligations_tenant
  ON public.vc_reporting_obligations (tenant_id);

-- Tenant lookups for call line items.
CREATE INDEX IF NOT EXISTS idx_capital_call_items_tenant
  ON public.vc_capital_call_items (tenant_id);

-- Distribution timeline filters by fund/date.
CREATE INDEX IF NOT EXISTS idx_distributions_fund_date
  ON public.vc_distributions (fund_id, distribution_date);

-- User-role joins and role filtering (column name differs by environment: profile_id vs user_id).
DO $idx$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_user_roles'
      AND column_name = 'profile_id'
  ) THEN
    EXECUTE
      'CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_profile ON public.vc_user_roles (tenant_id, profile_id)';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_user_roles'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE
      'CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_profile ON public.vc_user_roles (tenant_id, user_id)';
  END IF;
END
$idx$;

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_role_active
  ON public.vc_user_roles (tenant_id, role, is_active);

COMMIT;
