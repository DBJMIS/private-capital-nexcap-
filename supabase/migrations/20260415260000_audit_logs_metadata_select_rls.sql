-- Audit logs: metadata column + SELECT policy (admin OR row visible via parent entity RLS).
BEGIN;

ALTER TABLE public.vc_audit_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.vc_audit_logs.metadata IS 'Extra context (e.g. section_key, commitment_id) for UI and exports.';

DROP POLICY IF EXISTS vc_audit_logs_select ON public.vc_audit_logs;

CREATE POLICY vc_audit_logs_select ON public.vc_audit_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (
      public.vc_is_admin()
      OR (
        entity_type IN ('fund_application', 'vc_fund_application')
        AND EXISTS (
          SELECT 1 FROM public.vc_fund_applications fa
          WHERE fa.tenant_id = vc_audit_logs.tenant_id
            AND fa.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type = 'pre_screening'
        AND EXISTS (
          SELECT 1 FROM public.vc_pre_screening_checklists c
          WHERE c.tenant_id = vc_audit_logs.tenant_id
            AND c.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type = 'dd_questionnaire'
        AND EXISTS (
          SELECT 1 FROM public.vc_dd_questionnaires q
          WHERE q.tenant_id = vc_audit_logs.tenant_id
            AND q.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type IN ('assessment', 'vc_assessment')
        AND EXISTS (
          SELECT 1 FROM public.vc_assessments a
          WHERE a.tenant_id = vc_audit_logs.tenant_id
            AND a.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type IN ('deal', 'vc_deal')
        AND EXISTS (
          SELECT 1 FROM public.vc_deals d
          WHERE d.tenant_id = vc_audit_logs.tenant_id
            AND d.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type IN ('investment', 'vc_investment')
        AND EXISTS (
          SELECT 1 FROM public.vc_investments i
          WHERE i.tenant_id = vc_audit_logs.tenant_id
            AND i.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type IN ('disbursement', 'vc_disbursement')
        AND EXISTS (
          SELECT 1 FROM public.vc_disbursements x
          WHERE x.tenant_id = vc_audit_logs.tenant_id
            AND x.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type IN ('approval', 'vc_approval')
        AND EXISTS (
          SELECT 1 FROM public.vc_approvals ap
          WHERE ap.tenant_id = vc_audit_logs.tenant_id
            AND ap.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type IN ('task', 'vc_task')
        AND EXISTS (
          SELECT 1 FROM public.vc_tasks t
          WHERE t.tenant_id = vc_audit_logs.tenant_id
            AND t.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type IN ('investor', 'vc_investor')
        AND EXISTS (
          SELECT 1 FROM public.vc_investors iv
          WHERE iv.tenant_id = vc_audit_logs.tenant_id
            AND iv.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type = 'vc_investor_commitment'
        AND EXISTS (
          SELECT 1 FROM public.vc_investor_commitments ic
          WHERE ic.tenant_id = vc_audit_logs.tenant_id
            AND ic.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type = 'vc_monitoring_report'
        AND EXISTS (
          SELECT 1 FROM public.vc_monitoring_reports mr
          WHERE mr.tenant_id = vc_audit_logs.tenant_id
            AND mr.id = vc_audit_logs.entity_id
        )
      )
      OR (
        entity_type = 'vc_portfolio_snapshot'
        AND EXISTS (
          SELECT 1 FROM public.vc_portfolio_snapshots ps
          WHERE ps.tenant_id = vc_audit_logs.tenant_id
            AND ps.id = vc_audit_logs.entity_id
        )
      )
    )
  );

COMMIT;
