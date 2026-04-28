-- Aggregated compliance summary per active fund (matches JS deriveComplianceStatus + mapNestedFundsToComplianceRows).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_compliance_summary(p_tenant_id uuid)
RETURNS TABLE (
  fund_id uuid,
  fund_name text,
  manager_name text,
  currency text,
  listed boolean,
  dbj_commitment numeric,
  fund_category text,
  fund_status text,
  total_obligations bigint,
  accepted bigint,
  submitted bigint,
  outstanding bigint,
  overdue bigint,
  audits_outstanding bigint,
  compliance_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ro AS (
    SELECT
      o.fund_id,
      o.id,
      o.status,
      o.report_type,
      o.due_date
    FROM public.vc_reporting_obligations o
    WHERE o.tenant_id = p_tenant_id
  ),
  agg AS (
    SELECT
      pf.id AS fund_id,
      pf.fund_name,
      pf.manager_name,
      pf.currency,
      pf.listed,
      pf.dbj_commitment,
      pf.fund_category,
      pf.fund_status,
      COUNT(ro.id) AS total_obligations,
      COUNT(*) FILTER (
        WHERE ro.due_date <= CURRENT_DATE AND ro.status = 'accepted'
      ) AS accepted,
      COUNT(*) FILTER (
        WHERE ro.due_date <= CURRENT_DATE AND ro.status = 'submitted'
      ) AS submitted,
      COUNT(*) FILTER (
        WHERE ro.due_date <= CURRENT_DATE AND ro.status IN ('outstanding', 'overdue')
      ) AS outstanding,
      COUNT(*) FILTER (
        WHERE ro.due_date <= CURRENT_DATE AND ro.status = 'overdue'
      ) AS overdue,
      COUNT(*) FILTER (
        WHERE ro.due_date <= CURRENT_DATE
          AND ro.report_type = 'audited_annual'
          AND ro.status IN ('outstanding', 'overdue')
      ) AS audits_outstanding
    FROM public.vc_portfolio_funds pf
    LEFT JOIN ro ON ro.fund_id = pf.id
    WHERE pf.tenant_id = p_tenant_id
      AND pf.fund_status = 'active'
    GROUP BY
      pf.id,
      pf.fund_name,
      pf.manager_name,
      pf.currency,
      pf.listed,
      pf.dbj_commitment,
      pf.fund_category,
      pf.fund_status
  )
  SELECT
    a.fund_id,
    a.fund_name,
    a.manager_name,
    a.currency,
    a.listed,
    a.dbj_commitment,
    a.fund_category,
    a.fund_status,
    a.total_obligations,
    a.accepted,
    a.submitted,
    a.outstanding,
    a.overdue,
    a.audits_outstanding,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM ro r0 WHERE r0.fund_id = a.fund_id AND r0.due_date <= CURRENT_DATE
      ) THEN 'no_data'
      WHEN EXISTS (
        SELECT 1 FROM ro r1
        WHERE r1.fund_id = a.fund_id
          AND r1.due_date <= CURRENT_DATE
          AND r1.status IN ('overdue', 'outstanding')
          AND r1.report_type = 'audited_annual'
      ) THEN 'audits_outstanding'
      WHEN EXISTS (
        SELECT 1 FROM ro r2
        WHERE r2.fund_id = a.fund_id
          AND r2.due_date <= CURRENT_DATE
          AND r2.status IN ('overdue', 'outstanding')
          AND r2.report_type <> 'audited_annual'
      ) THEN 'reports_outstanding'
      WHEN NOT EXISTS (
        SELECT 1 FROM ro r3
        WHERE r3.fund_id = a.fund_id
          AND r3.due_date <= CURRENT_DATE
          AND r3.status NOT IN ('accepted', 'submitted')
      ) THEN 'fully_compliant'
      ELSE 'partially_compliant'
    END AS compliance_status
  FROM agg a
  ORDER BY a.fund_name;
$$;

COMMENT ON FUNCTION public.get_compliance_summary(uuid) IS
  'Per-active-fund reporting aggregates for compliance dashboard (matches deriveComplianceStatus + mapNestedFundsToComplianceRows).';

GRANT EXECUTE ON FUNCTION public.get_compliance_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_compliance_summary(uuid) TO authenticated;

COMMIT;
