-- Additional composite indexes for common portfolio / RBAC filters (safe IF NOT EXISTS).
BEGIN;

CREATE INDEX IF NOT EXISTS idx_reporting_obligations_fund_status
  ON public.vc_reporting_obligations (fund_id, status);

CREATE INDEX IF NOT EXISTS idx_capital_calls_tenant_fund
  ON public.vc_capital_calls (tenant_id, fund_id);

CREATE INDEX IF NOT EXISTS idx_distributions_tenant_fund
  ON public.vc_distributions (tenant_id, fund_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_active_role
  ON public.vc_user_roles (tenant_id, is_active, role);

COMMIT;
