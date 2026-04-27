-- Repair fund_category CHECK after partial applies or older definitions missing values (e.g. bigge_fund).
BEGIN;

ALTER TABLE public.vc_portfolio_funds
  DROP CONSTRAINT IF EXISTS vc_portfolio_funds_fund_category_check;

ALTER TABLE public.vc_portfolio_funds
  ADD CONSTRAINT vc_portfolio_funds_fund_category_check
  CHECK (
    fund_category IS NULL
    OR fund_category IN (
      'sme_fund',
      'growth_equity',
      'private_credit',
      'infrastructure',
      'special_situation',
      'angel',
      'bigge_fund'
    )
  );

COMMIT;
