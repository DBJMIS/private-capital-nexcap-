-- Workflow: route approvals to a specific approver (optional).
BEGIN;

ALTER TABLE public.vc_approvals
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vc_approvals.assigned_to IS
  'When set, this approval appears in that user''s queue; when null, any eligible approver may decide.';

DROP INDEX IF EXISTS vc_approvals_one_pending;

CREATE UNIQUE INDEX vc_approvals_one_pending
  ON public.vc_approvals (tenant_id, entity_type, entity_id, approval_type)
  WHERE status = 'pending';

COMMIT;
