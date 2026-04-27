-- Epic 2: Pre-qualification (DBJ Appendix 5.3) — structured checklist + AI fields
BEGIN;

CREATE TYPE public.vc_prequal_checklist_response AS ENUM (
  'yes',
  'no',
  'partial',
  'not_reviewed'
);

CREATE TABLE public.vc_prequalification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id)
    ON DELETE CASCADE,
  application_id uuid NOT NULL,
  CONSTRAINT vc_prequalification_application_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES public.vc_fund_applications (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_prequalification_tenant_application_key UNIQUE (tenant_id, application_id),

  s21_company_info public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s21_fund_info public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s21_fund_strategy public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s21_fund_management public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s21_legal_regulatory public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s21_comments text,

  s22_company_management public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s22_fund_general public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s22_fund_financial public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s22_fund_esg public.vc_prequal_checklist_response NOT NULL DEFAULT 'not_reviewed',
  s22_comments text,

  date_received date,
  time_received time,
  soft_copy_received boolean NOT NULL DEFAULT false,
  hard_copy_received boolean NOT NULL DEFAULT false,

  prequalified boolean,
  not_prequalified boolean,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewer_name text,
  reviewed_at timestamptz,

  overall_status text NOT NULL DEFAULT 'pending'
    CHECK (overall_status IN ('pending', 'prequalified', 'not_prequalified')),

  ai_summary jsonb,
  ai_analysed_at timestamptz,
  proposal_document_path text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_vc_prequalification_updated_at
  BEFORE UPDATE ON public.vc_prequalification
  FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_prequalification_tenant_application
  ON public.vc_prequalification (tenant_id, application_id);

ALTER TABLE public.vc_prequalification ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_prequalification_select ON public.vc_prequalification
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_prequalification_insert ON public.vc_prequalification
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_prequalification_update ON public.vc_prequalification
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_prequalification_delete ON public.vc_prequalification
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

COMMENT ON TABLE public.vc_prequalification IS
  'DBJ Fund Manager pre-qualification checklist (Appendix 5.3); officer decision gates application status.';

COMMIT;
