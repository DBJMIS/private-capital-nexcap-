-- Epic 6 seed: DBJ distributions & dividends history (native currency; tenant-specific)
-- Run after portfolio_funds_seed / dev tenant exists.
-- Pure SQL (no DO blocks) to stay safe in statement-splitting SQL runners.

-- ---------------------------------------------------------------------------
-- CMF II - USD 744,000 total
-- ---------------------------------------------------------------------------
WITH fund AS (
  SELECT id AS fund_id
  FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Mezzanine Fund II'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '2019-03-31'::date, 'dividend', 62000::numeric, 'USD', 62000::numeric, 'Portfolio', 'Q1 2019 income distribution'),
      (2, '2019-09-30'::date, 'dividend', 58000::numeric, 'USD', 120000::numeric, 'Portfolio', 'Q3 2019 income distribution'),
      (3, '2020-03-31'::date, 'dividend', 55000::numeric, 'USD', 175000::numeric, 'Portfolio', 'Q1 2020 income distribution'),
      (4, '2020-09-30'::date, 'dividend', 48000::numeric, 'USD', 223000::numeric, 'Portfolio', 'Q3 2020 income distribution'),
      (5, '2021-03-31'::date, 'dividend', 52000::numeric, 'USD', 275000::numeric, 'Portfolio', 'Q1 2021 income distribution'),
      (6, '2021-09-30'::date, 'dividend', 61000::numeric, 'USD', 336000::numeric, 'Portfolio', 'Q3 2021 income distribution'),
      (7, '2022-03-31'::date, 'dividend', 68000::numeric, 'USD', 404000::numeric, 'Portfolio', 'Q1 2022 income distribution'),
      (8, '2022-09-30'::date, 'dividend', 71000::numeric, 'USD', 475000::numeric, 'Portfolio', 'Q3 2022 income distribution'),
      (9, '2023-03-31'::date, 'dividend', 74000::numeric, 'USD', 549000::numeric, 'Portfolio', 'Q1 2023 income distribution'),
      (10, '2023-09-30'::date, 'dividend', 78000::numeric, 'USD', 627000::numeric, 'Portfolio', 'Q3 2023 income distribution'),
      (11, '2024-03-31'::date, 'dividend', 61000::numeric, 'USD', 688000::numeric, 'Portfolio', 'Q1 2024 income distribution'),
      (12, '2024-09-30'::date, 'dividend', 56000::numeric, 'USD', 744000::numeric, 'Portfolio', 'Q3 2024 income distribution')
  ) AS v(distribution_number, distribution_date, return_type, amount, currency, cumulative_total, source_company, notes)
)
INSERT INTO vc_distributions (
  tenant_id,
  fund_id,
  distribution_number,
  distribution_date,
  return_type,
  amount,
  currency,
  cumulative_total,
  source_company,
  notes
)
SELECT
  '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid,
  fund.fund_id,
  rows.distribution_number,
  rows.distribution_date,
  rows.return_type,
  rows.amount,
  rows.currency,
  rows.cumulative_total,
  rows.source_company,
  rows.notes
FROM fund
CROSS JOIN rows
ON CONFLICT (fund_id, distribution_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SYGNUS - USD 172,000 total
-- ---------------------------------------------------------------------------
WITH fund AS (
  SELECT id AS fund_id
  FROM vc_portfolio_funds
  WHERE fund_name = 'Sygnus Credit Investments'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '2019-06-30'::date, 'dividend', 28000::numeric, 'USD', 28000::numeric, 'Sygnus Credit Investments', 'Semi-annual dividend'),
      (2, '2019-12-31'::date, 'dividend', 31000::numeric, 'USD', 59000::numeric, 'Sygnus Credit Investments', 'Semi-annual dividend'),
      (3, '2020-06-30'::date, 'dividend', 24000::numeric, 'USD', 83000::numeric, 'Sygnus Credit Investments', 'Semi-annual dividend'),
      (4, '2021-06-30'::date, 'dividend', 26000::numeric, 'USD', 109000::numeric, 'Sygnus Credit Investments', 'Semi-annual dividend'),
      (5, '2022-06-30'::date, 'dividend', 32000::numeric, 'USD', 141000::numeric, 'Sygnus Credit Investments', 'Semi-annual dividend'),
      (6, '2023-06-30'::date, 'dividend', 31000::numeric, 'USD', 172000::numeric, 'Sygnus Credit Investments', 'Semi-annual dividend')
  ) AS v(distribution_number, distribution_date, return_type, amount, currency, cumulative_total, source_company, notes)
)
INSERT INTO vc_distributions (
  tenant_id,
  fund_id,
  distribution_number,
  distribution_date,
  return_type,
  amount,
  currency,
  cumulative_total,
  source_company,
  notes
)
SELECT
  '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid,
  fund.fund_id,
  rows.distribution_number,
  rows.distribution_date,
  rows.return_type,
  rows.amount,
  rows.currency,
  rows.cumulative_total,
  rows.source_company,
  rows.notes
FROM fund
CROSS JOIN rows
ON CONFLICT (fund_id, distribution_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- QUANTAS - JMD 32,499,000 total
-- ---------------------------------------------------------------------------
WITH fund AS (
  SELECT id AS fund_id
  FROM vc_portfolio_funds
  WHERE fund_name = 'Quantas Advantage Inc.'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '2023-06-30'::date, 'dividend', 9699000::numeric, 'JMD', 9699000::numeric, 'Quantas Advantage', 'Annual distribution FY 2023'),
      (2, '2024-06-30'::date, 'dividend', 11400000::numeric, 'JMD', 21099000::numeric, 'Quantas Advantage', 'Annual distribution FY 2024'),
      (3, '2025-06-30'::date, 'dividend', 11400000::numeric, 'JMD', 32499000::numeric, 'Quantas Advantage', 'Annual distribution FY 2025')
  ) AS v(distribution_number, distribution_date, return_type, amount, currency, cumulative_total, source_company, notes)
)
INSERT INTO vc_distributions (
  tenant_id,
  fund_id,
  distribution_number,
  distribution_date,
  return_type,
  amount,
  currency,
  cumulative_total,
  source_company,
  notes
)
SELECT
  '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid,
  fund.fund_id,
  rows.distribution_number,
  rows.distribution_date,
  rows.return_type,
  rows.amount,
  rows.currency,
  rows.cumulative_total,
  rows.source_company,
  rows.notes
FROM fund
CROSS JOIN rows
ON CONFLICT (fund_id, distribution_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- VERTEX - JMD 41,919,000 total
-- ---------------------------------------------------------------------------
WITH fund AS (
  SELECT id AS fund_id
  FROM vc_portfolio_funds
  WHERE fund_name = 'JMMB-Vertex SME Holdings'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
rows AS (
  SELECT *
  FROM (
    VALUES
      (1, '2025-09-30'::date, 'capital_gain', 41919000::numeric, 'JMD', 41919000::numeric, 'ICRH', 'Capital gain on partial exit - ICRH')
  ) AS v(distribution_number, distribution_date, return_type, amount, currency, cumulative_total, source_company, notes)
)
INSERT INTO vc_distributions (
  tenant_id,
  fund_id,
  distribution_number,
  distribution_date,
  return_type,
  amount,
  currency,
  cumulative_total,
  source_company,
  notes
)
SELECT
  '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid,
  fund.fund_id,
  rows.distribution_number,
  rows.distribution_date,
  rows.return_type,
  rows.amount,
  rows.currency,
  rows.cumulative_total,
  rows.source_company,
  rows.notes
FROM fund
CROSS JOIN rows
ON CONFLICT (fund_id, distribution_number) DO NOTHING;
