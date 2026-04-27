-- Narrative extract: fund profile, allocations, LPs, pipeline, capital account detail (JSONB).
BEGIN;

ALTER TABLE public.vc_fund_narrative_extracts
  ADD COLUMN IF NOT EXISTS fund_profile jsonb,
  ADD COLUMN IF NOT EXISTS allocations jsonb,
  ADD COLUMN IF NOT EXISTS fund_lps jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_stats jsonb,
  ADD COLUMN IF NOT EXISTS capital_account_detail jsonb;

COMMENT ON COLUMN public.vc_fund_narrative_extracts.fund_profile IS 'Extracted fund vintage, size, closes, year-end, strategy (AI + analyst edits).';
COMMENT ON COLUMN public.vc_fund_narrative_extracts.allocations IS 'Sector and geographic allocation percentages from report.';
COMMENT ON COLUMN public.vc_fund_narrative_extracts.fund_lps IS 'LP names, commitments, percentages from report.';
COMMENT ON COLUMN public.vc_fund_narrative_extracts.pipeline_stats IS 'Pipeline deals, value, sectors, term sheets from report.';
COMMENT ON COLUMN public.vc_fund_narrative_extracts.capital_account_detail IS 'Fee and portfolio drawdown breakdown from Fund Capital Account sections.';

COMMIT;
