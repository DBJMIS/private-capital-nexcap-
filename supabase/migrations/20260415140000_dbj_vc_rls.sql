-- =============================================================================
-- DBJ VC — Row Level Security (tenant isolation + role gates)
-- Depends on: 20260415120000_dbj_vc_core_schema.sql
-- =============================================================================
-- Role model (profiles.role text):
--   admin | analyst | officer | viewer | approver (approver optional; see notes)
--
-- Approvals UPDATE: only admin + approver (analyst/officer explicitly excluded).
--   If you do not store "approver" yet, either add it to profiles + CHECK, or
--   temporarily widen this policy to include another role at the DB layer.
--
-- Service role (Supabase) bypasses RLS — use only for migrations, webhooks,
-- and tightly scoped server jobs.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Helper functions (SECURITY DEFINER — bypass RLS on vc_profiles safely)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.tenant_id
  FROM public.vc_profiles p
  WHERE p.user_id = (SELECT auth.uid())
    AND p.is_active = true
  ORDER BY p.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.vc_profiles p
  WHERE p.user_id = (SELECT auth.uid())
    AND p.is_active = true
  ORDER BY p.created_at
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_tenant_id() IS
  'Active profile tenant for auth.uid(); NULL if none → RLS fails closed.';

COMMENT ON FUNCTION public.get_my_role() IS
  'Active profile role for auth.uid(); NULL if none → RLS fails closed.';

-- Convenience predicates (same DEFINER safety as above; no recursion into RLS)

CREATE OR REPLACE FUNCTION public.vc_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vc_profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.is_active = true
      AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.vc_can_write_standard()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vc_profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.is_active = true
      AND p.role IN ('admin', 'analyst', 'officer')
  );
$$;

CREATE OR REPLACE FUNCTION public.vc_can_update_assessment_row(p_assessment_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vc_assessments a
    WHERE a.id = p_assessment_id
      AND a.tenant_id = p_tenant_id
      AND (
        EXISTS (
          SELECT 1 FROM public.vc_profiles p
          WHERE p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND p.tenant_id = p_tenant_id
            AND p.role = 'admin'
        )
        OR a.evaluator_id = (SELECT auth.uid())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.vc_can_update_approvals_row()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vc_profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.is_active = true
      AND p.role IN ('admin', 'approver')
  );
$$;

COMMENT ON FUNCTION public.vc_can_update_approvals_row() IS
  'UPDATE on vc_approvals: admin or approver only (analyst/officer blocked).';

REVOKE ALL ON FUNCTION public.get_my_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vc_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vc_can_write_standard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vc_can_update_assessment_row(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vc_can_update_approvals_row() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vc_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vc_can_write_standard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vc_can_update_assessment_row(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vc_can_update_approvals_row() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) Enable RLS (idempotent if already enabled in core migration)
-- -----------------------------------------------------------------------------

ALTER TABLE public.vc_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_fund_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_pre_screening_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_dd_staff_bios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_assessment_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_assessment_subcriteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_monitoring_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_investor_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3) Policies — vc_tenants
-- -----------------------------------------------------------------------------

CREATE POLICY vc_tenants_select ON public.vc_tenants
  FOR SELECT TO authenticated
  USING (id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_tenants_update ON public.vc_tenants
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT public.get_my_tenant_id())
    AND public.vc_is_admin()
  )
  WITH CHECK (
    id = (SELECT public.get_my_tenant_id())
    AND public.vc_is_admin()
  );

-- -----------------------------------------------------------------------------
-- 3) Policies — vc_profiles (avoid recursion: no subselect on vc_profiles in USING)
-- -----------------------------------------------------------------------------

CREATE POLICY vc_profiles_select ON public.vc_profiles
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_profiles_insert ON public.vc_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_is_admin()
  );

CREATE POLICY vc_profiles_update ON public.vc_profiles
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (
      user_id = (SELECT auth.uid())
      OR public.vc_is_admin()
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (
      user_id = (SELECT auth.uid())
      OR public.vc_is_admin()
    )
  );

CREATE POLICY vc_profiles_delete ON public.vc_profiles
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_is_admin()
  );

-- -----------------------------------------------------------------------------
-- 3) Policies — generic tenant tables (SELECT all tenant; INSERT/UPDATE writers;
--       DELETE admin only). Viewer: read-only.
-- -----------------------------------------------------------------------------

-- vc_fund_applications
CREATE POLICY vc_fund_applications_select ON public.vc_fund_applications
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_fund_applications_insert ON public.vc_fund_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_fund_applications_update ON public.vc_fund_applications
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_can_write_standard()
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_fund_applications_delete ON public.vc_fund_applications
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_is_admin()
  );

-- vc_pre_screening_checklists
CREATE POLICY vc_pre_screening_checklists_select ON public.vc_pre_screening_checklists
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_pre_screening_checklists_insert ON public.vc_pre_screening_checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_pre_screening_checklists_update ON public.vc_pre_screening_checklists
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_pre_screening_checklists_delete ON public.vc_pre_screening_checklists
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_dd_questionnaires
CREATE POLICY vc_dd_questionnaires_select ON public.vc_dd_questionnaires
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_dd_questionnaires_insert ON public.vc_dd_questionnaires
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_dd_questionnaires_update ON public.vc_dd_questionnaires
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_dd_questionnaires_delete ON public.vc_dd_questionnaires
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_dd_sections
CREATE POLICY vc_dd_sections_select ON public.vc_dd_sections
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_dd_sections_insert ON public.vc_dd_sections
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_dd_sections_update ON public.vc_dd_sections
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_dd_sections_delete ON public.vc_dd_sections
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_dd_answers
CREATE POLICY vc_dd_answers_select ON public.vc_dd_answers
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_dd_answers_insert ON public.vc_dd_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_dd_answers_update ON public.vc_dd_answers
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_dd_answers_delete ON public.vc_dd_answers
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_dd_documents
CREATE POLICY vc_dd_documents_select ON public.vc_dd_documents
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_dd_documents_insert ON public.vc_dd_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_dd_documents_update ON public.vc_dd_documents
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_dd_documents_delete ON public.vc_dd_documents
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_dd_staff_bios
CREATE POLICY vc_dd_staff_bios_select ON public.vc_dd_staff_bios
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_dd_staff_bios_insert ON public.vc_dd_staff_bios
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_dd_staff_bios_update ON public.vc_dd_staff_bios
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_dd_staff_bios_delete ON public.vc_dd_staff_bios
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_deals
CREATE POLICY vc_deals_select ON public.vc_deals
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_deals_insert ON public.vc_deals
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_deals_update ON public.vc_deals
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_deals_delete ON public.vc_deals
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_investments
CREATE POLICY vc_investments_select ON public.vc_investments
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_investments_insert ON public.vc_investments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_investments_update ON public.vc_investments
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_investments_delete ON public.vc_investments
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_disbursements
CREATE POLICY vc_disbursements_select ON public.vc_disbursements
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_disbursements_insert ON public.vc_disbursements
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_disbursements_update ON public.vc_disbursements
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_disbursements_delete ON public.vc_disbursements
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_portfolio_snapshots
CREATE POLICY vc_portfolio_snapshots_select ON public.vc_portfolio_snapshots
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_portfolio_snapshots_insert ON public.vc_portfolio_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_portfolio_snapshots_update ON public.vc_portfolio_snapshots
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_portfolio_snapshots_delete ON public.vc_portfolio_snapshots
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_monitoring_reports
CREATE POLICY vc_monitoring_reports_select ON public.vc_monitoring_reports
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_monitoring_reports_insert ON public.vc_monitoring_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_monitoring_reports_update ON public.vc_monitoring_reports
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_monitoring_reports_delete ON public.vc_monitoring_reports
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_investors
CREATE POLICY vc_investors_select ON public.vc_investors
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_investors_insert ON public.vc_investors
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_investors_update ON public.vc_investors
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_investors_delete ON public.vc_investors
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_investor_commitments
CREATE POLICY vc_investor_commitments_select ON public.vc_investor_commitments
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_investor_commitments_insert ON public.vc_investor_commitments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_investor_commitments_update ON public.vc_investor_commitments
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_investor_commitments_delete ON public.vc_investor_commitments
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- vc_tasks
CREATE POLICY vc_tasks_select ON public.vc_tasks
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_tasks_insert ON public.vc_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_tasks_update ON public.vc_tasks
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_tasks_delete ON public.vc_tasks
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- -----------------------------------------------------------------------------
-- vc_assessments — UPDATE: evaluator + admin only (INSERT still writers)
-- -----------------------------------------------------------------------------

CREATE POLICY vc_assessments_select ON public.vc_assessments
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_assessments_insert ON public.vc_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
    AND (
      public.vc_is_admin()
      OR evaluator_id = (SELECT auth.uid())
    )
  );

CREATE POLICY vc_assessments_update ON public.vc_assessments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_can_update_assessment_row(id, tenant_id)
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_can_update_assessment_row(id, tenant_id)
  );

CREATE POLICY vc_assessments_delete ON public.vc_assessments
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- -----------------------------------------------------------------------------
-- vc_assessment_criteria / vc_assessment_subcriteria — same gate as parent assessment
-- -----------------------------------------------------------------------------

CREATE POLICY vc_assessment_criteria_select ON public.vc_assessment_criteria
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_assessment_criteria_insert ON public.vc_assessment_criteria
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
    AND public.vc_can_update_assessment_row(assessment_id, tenant_id)
  );

CREATE POLICY vc_assessment_criteria_update ON public.vc_assessment_criteria
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_can_update_assessment_row(assessment_id, tenant_id)
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_can_update_assessment_row(assessment_id, tenant_id)
  );

CREATE POLICY vc_assessment_criteria_delete ON public.vc_assessment_criteria
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

CREATE POLICY vc_assessment_subcriteria_select ON public.vc_assessment_subcriteria
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_assessment_subcriteria_insert ON public.vc_assessment_subcriteria
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
    AND EXISTS (
      SELECT 1
      FROM public.vc_assessment_criteria c
      WHERE c.id = criteria_id
        AND c.tenant_id = tenant_id
        AND public.vc_can_update_assessment_row(c.assessment_id, c.tenant_id)
    )
  );

CREATE POLICY vc_assessment_subcriteria_update ON public.vc_assessment_subcriteria
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.vc_assessment_criteria c
      WHERE c.id = criteria_id
        AND c.tenant_id = tenant_id
        AND public.vc_can_update_assessment_row(c.assessment_id, c.tenant_id)
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.vc_assessment_criteria c
      WHERE c.id = criteria_id
        AND c.tenant_id = tenant_id
        AND public.vc_can_update_assessment_row(c.assessment_id, c.tenant_id)
    )
  );

CREATE POLICY vc_assessment_subcriteria_delete ON public.vc_assessment_subcriteria
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- -----------------------------------------------------------------------------
-- vc_approvals — INSERT/SELECT writers; UPDATE only admin + approver role
-- -----------------------------------------------------------------------------

CREATE POLICY vc_approvals_select ON public.vc_approvals
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_approvals_insert ON public.vc_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_approvals_update ON public.vc_approvals
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_can_update_approvals_row()
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND public.vc_can_update_approvals_row()
  );

CREATE POLICY vc_approvals_delete ON public.vc_approvals
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- -----------------------------------------------------------------------------
-- vc_audit_logs — append-only: SELECT tenant; INSERT self-tenant + actor bind;
--                   no UPDATE / no DELETE policies → denied for authenticated
-- -----------------------------------------------------------------------------

CREATE POLICY vc_audit_logs_select ON public.vc_audit_logs
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_audit_logs_insert ON public.vc_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
    AND (
      actor_id IS NULL
      OR actor_id = (SELECT auth.uid())
    )
  );

COMMIT;
