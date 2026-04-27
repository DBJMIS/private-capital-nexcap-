-- PCTU quarterly report: optional fund-level profile (directors, IC, team bios, ESG bullets).
BEGIN;

ALTER TABLE public.vc_portfolio_funds
  ADD COLUMN IF NOT EXISTS pctu_profile jsonb;

COMMENT ON COLUMN public.vc_portfolio_funds.pctu_profile IS 'PCTU report profile JSON (directors, principals, IC, management team, ESG notes).';

COMMIT;
