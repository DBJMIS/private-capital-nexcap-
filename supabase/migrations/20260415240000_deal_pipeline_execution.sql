-- Deal pipeline: notes, assessment link, one deal per application, one active investment per deal,
-- remaining_amount sync, atomic disbursement approval RPC.
BEGIN;

-- -----------------------------------------------------------------------------
-- vc_deals: link to assessment; at most one deal per application per tenant
-- -----------------------------------------------------------------------------
ALTER TABLE public.vc_deals
  ADD COLUMN IF NOT EXISTS assessment_id uuid NULL;

ALTER TABLE public.vc_deals
  DROP CONSTRAINT IF EXISTS vc_deals_assessment_fk;

ALTER TABLE public.vc_deals
  ADD CONSTRAINT vc_deals_assessment_fk
  FOREIGN KEY (assessment_id)
  REFERENCES public.vc_assessments (id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vc_deals_tenant_application_unique
  ON public.vc_deals (tenant_id, application_id);

-- -----------------------------------------------------------------------------
-- Deal internal notes (timestamped, author)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_deal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.vc_tenants (id) ON DELETE CASCADE,
  deal_id uuid NOT NULL,
  body text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_deal_notes_deal_fk FOREIGN KEY (tenant_id, deal_id)
    REFERENCES public.vc_deals (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vc_deal_notes_tenant_deal
  ON public.vc_deal_notes (tenant_id, deal_id, created_at DESC);

ALTER TABLE public.vc_deal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_deal_notes_select ON public.vc_deal_notes
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY vc_deal_notes_insert ON public.vc_deal_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
    AND public.vc_can_write_standard()
    AND author_id = (SELECT auth.uid())
  );

CREATE POLICY vc_deal_notes_delete ON public.vc_deal_notes
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()) AND public.vc_is_admin());

-- -----------------------------------------------------------------------------
-- At most one active investment per deal
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS vc_investments_one_active_per_deal
  ON public.vc_investments (tenant_id, deal_id)
  WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- Keep remaining_amount_usd = approved - disbursed
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vc_investments_sync_remaining()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.remaining_amount_usd := COALESCE(NEW.approved_amount_usd, 0) - COALESCE(NEW.disbursed_amount_usd, 0);
  IF NEW.remaining_amount_usd < 0 THEN
    RAISE EXCEPTION 'investment_remaining_negative' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vc_investments_sync_remaining ON public.vc_investments;
CREATE TRIGGER trg_vc_investments_sync_remaining
BEFORE INSERT OR UPDATE OF approved_amount_usd, disbursed_amount_usd ON public.vc_investments
FOR EACH ROW
EXECUTE PROCEDURE public.vc_investments_sync_remaining();

-- -----------------------------------------------------------------------------
-- Approve a pending disbursement and increase disbursed_amount (single transaction)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vc_approve_disbursement(
  p_tenant_id uuid,
  p_disbursement_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d record;
  v_inv record;
  v_new_disbursed numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_profiles p
    WHERE p.user_id = v_uid AND p.tenant_id = p_tenant_id AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT d.* INTO v_d
  FROM public.vc_disbursements d
  WHERE d.id = p_disbursement_id AND d.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'disbursement_not_found';
  END IF;

  IF v_d.status <> 'pending' THEN
    RAISE EXCEPTION 'disbursement_not_pending';
  END IF;

  SELECT i.* INTO v_inv
  FROM public.vc_investments i
  WHERE i.id = v_d.investment_id AND i.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'investment_not_found';
  END IF;

  v_new_disbursed := COALESCE(v_inv.disbursed_amount_usd, 0) + COALESCE(v_d.amount_usd, 0);
  IF v_new_disbursed > COALESCE(v_inv.approved_amount_usd, 0) THEN
    RAISE EXCEPTION 'disbursement_exceeds_approved';
  END IF;

  UPDATE public.vc_investments
  SET disbursed_amount_usd = v_new_disbursed,
      updated_at = now()
  WHERE id = v_inv.id AND tenant_id = p_tenant_id;

  UPDATE public.vc_disbursements
  SET status = 'disbursed',
      approved_by = v_uid,
      updated_at = now()
  WHERE id = p_disbursement_id AND tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vc_approve_disbursement(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_approve_disbursement(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.vc_approve_disbursement(uuid, uuid) IS
  'Marks pending disbursement as disbursed and increases investment.disbursed_amount_usd atomically.';

COMMIT;
