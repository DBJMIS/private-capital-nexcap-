-- Per-commitment deployed amount (for utilization vs committed on that line).
BEGIN;

ALTER TABLE public.vc_investor_commitments
  ADD COLUMN IF NOT EXISTS deployed_amount_usd numeric NOT NULL DEFAULT 0;

ALTER TABLE public.vc_investor_commitments
  DROP CONSTRAINT IF EXISTS vc_investor_commitments_deployed_lte_committed;

ALTER TABLE public.vc_investor_commitments
  ADD CONSTRAINT vc_investor_commitments_deployed_lte_committed CHECK (
    deployed_amount_usd >= 0
    AND deployed_amount_usd <= committed_amount_usd
  );

COMMENT ON COLUMN public.vc_investor_commitments.deployed_amount_usd IS
  'Capital deployed against this commitment line (≤ committed_amount_usd).';

COMMIT;
