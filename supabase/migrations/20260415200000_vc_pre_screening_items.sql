-- DBJ Pre-Screening: granular checklist items + review flag
BEGIN;

ALTER TABLE public.vc_pre_screening_checklists
  ADD COLUMN IF NOT EXISTS flagged_for_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.vc_pre_screening_checklists
  ADD CONSTRAINT vc_pre_screening_checklists_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TYPE public.pre_screening_item_status AS ENUM ('yes', 'no', 'pending');

CREATE TABLE public.vc_pre_screening_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL,
  category varchar(64) NOT NULL,
  item_key varchar(128) NOT NULL,
  label text NOT NULL,
  status public.pre_screening_item_status NOT NULL DEFAULT 'pending',
  notes text,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_pre_screening_items_checklist_fk FOREIGN KEY (tenant_id, checklist_id)
    REFERENCES public.vc_pre_screening_checklists (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT vc_pre_screening_items_checklist_item_key UNIQUE (checklist_id, item_key),
  CONSTRAINT vc_pre_screening_items_category_chk CHECK (
    category IN (
      'fund_information',
      'fund_strategy',
      'fund_management',
      'legal_regulatory'
    )
  )
);

CREATE TRIGGER trg_vc_pre_screening_items_set_updated_at
BEFORE UPDATE ON public.vc_pre_screening_items
FOR EACH ROW EXECUTE PROCEDURE public.vc_set_updated_at();

CREATE INDEX idx_vc_pre_screening_items_tenant_checklist
  ON public.vc_pre_screening_items (tenant_id, checklist_id);

CREATE INDEX idx_vc_pre_screening_items_checklist_category
  ON public.vc_pre_screening_items (checklist_id, category);

ALTER TABLE public.vc_pre_screening_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_pre_screening_items_select ON public.vc_pre_screening_items
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_pre_screening_items_insert ON public.vc_pre_screening_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
  );

CREATE POLICY vc_pre_screening_items_update ON public.vc_pre_screening_items
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard())
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_can_write_standard());

CREATE POLICY vc_pre_screening_items_delete ON public.vc_pre_screening_items
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

COMMENT ON TABLE public.vc_pre_screening_items IS
  'DBJ Pre-Screening Checklist line items; categories mirror institutional form.';

COMMIT;
