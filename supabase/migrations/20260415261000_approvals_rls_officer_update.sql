-- Allow officers to update approval rows (pre-screening & disbursement decisions).
BEGIN;

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
      AND p.role IN ('admin', 'approver', 'officer')
  );
$$;

COMMENT ON FUNCTION public.vc_can_update_approvals_row() IS
  'UPDATE on vc_approvals: admin, approver, or officer (workflow decisions).';

COMMIT;
