-- Allow approvers to insert IC approvals and to promote applications to approved via RPC.
BEGIN;

CREATE OR REPLACE FUNCTION public.vc_is_approver()
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
      AND p.tenant_id = (SELECT public.get_my_tenant_id())
      AND p.is_active = true
      AND p.role IN ('admin', 'approver')
  );
$$;

REVOKE ALL ON FUNCTION public.vc_is_approver() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_is_approver() TO authenticated;

DROP POLICY IF EXISTS vc_approvals_insert ON public.vc_approvals;
CREATE POLICY vc_approvals_insert ON public.vc_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND (public.vc_can_write_standard() OR public.vc_is_approver())
  );

-- Atomically set application to approved from due_diligence (approver/admin only).
CREATE OR REPLACE FUNCTION public.vc_app_approve_for_pipeline(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
  v_uid uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT tenant_id INTO v_tid
  FROM public.vc_fund_applications
  WHERE id = p_application_id AND deleted_at IS NULL;

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'application_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.vc_profiles p
    WHERE p.user_id = v_uid AND p.tenant_id = v_tid AND p.is_active = true
      AND p.role IN ('admin', 'approver')
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.vc_fund_applications
  SET status = 'approved', updated_at = now()
  WHERE id = p_application_id AND tenant_id = v_tid AND status = 'due_diligence';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.vc_app_approve_for_pipeline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_app_approve_for_pipeline(uuid) TO authenticated;

COMMIT;
