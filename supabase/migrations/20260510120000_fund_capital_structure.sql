-- Capital structure: fund size status and close metadata on portfolio funds
BEGIN;

ALTER TABLE public.vc_portfolio_funds
  ADD COLUMN IF NOT EXISTS fund_size_status text
    CHECK (
      fund_size_status IS NULL
      OR fund_size_status IN (
        'confirmed',
        'estimated',
        'sole_investor',
        'not_applicable',
        'unknown'
      )
    ),
  ADD COLUMN IF NOT EXISTS fund_close_lp_count integer,
  ADD COLUMN IF NOT EXISTS fund_close_date_actual date;

COMMENT ON COLUMN public.vc_portfolio_funds.fund_size_status IS
  'confirmed=verified at close, estimated=fundraising open, sole_investor=DBJ only LP, not_applicable=unusual structure, unknown=legacy data gap';

COMMIT;
