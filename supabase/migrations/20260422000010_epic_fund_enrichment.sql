BEGIN;

-- Remove any prior category check so we can recreate a single definition (avoids partial / stale lists).
ALTER TABLE public.vc_portfolio_funds
  DROP CONSTRAINT IF EXISTS vc_portfolio_funds_fund_category_check;

ALTER TABLE public.vc_portfolio_funds
  ADD COLUMN IF NOT EXISTS fund_category text,
  ADD COLUMN IF NOT EXISTS fund_end_date date,
  ADD COLUMN IF NOT EXISTS is_pvc boolean
    DEFAULT false,
  ADD COLUMN IF NOT EXISTS management_fee_pct numeric,
  ADD COLUMN IF NOT EXISTS performance_fee_pct numeric,
  ADD COLUMN IF NOT EXISTS hurdle_rate_pct numeric,
  ADD COLUMN IF NOT EXISTS target_irr_pct numeric,
  ADD COLUMN IF NOT EXISTS sector_focus text[],
  ADD COLUMN IF NOT EXISTS impact_objectives integer[];

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

-- SME FUNDS
UPDATE vc_portfolio_funds SET
  fund_category = 'sme_fund',
  fund_end_date = '2032-10-01',
  is_pvc = false,
  management_fee_pct = 2.0,
  performance_fee_pct = 20.0,
  hurdle_rate_pct = 8.0,
  target_irr_pct = 25.0,
  sector_focus = ARRAY[
    'Healthcare','ICT','Manufacturing',
    'Tourism','Retail & Distribution'
  ],
  impact_objectives = ARRAY[1,2,3]
WHERE fund_name = 'NCBCM Stratus Private Equity';

UPDATE vc_portfolio_funds SET
  fund_category = 'sme_fund',
  fund_end_date = '2029-07-01',
  is_pvc = false,
  management_fee_pct = 2.0,
  performance_fee_pct = 25.0,
  hurdle_rate_pct = 8.0,
  target_irr_pct = 15.0,
  sector_focus = ARRAY[
    'Courier Service','Food Service',
    'Distribution','Transportation'
  ],
  impact_objectives = ARRAY[1,2,3]
WHERE fund_name = 'JMMB-Vertex SME Holdings';

UPDATE vc_portfolio_funds SET
  fund_category = 'sme_fund',
  fund_end_date = '2032-06-01',
  is_pvc = false,
  management_fee_pct = 2.5,
  performance_fee_pct = 20.0,
  hurdle_rate_pct = 8.0,
  target_irr_pct = 20.0,
  sector_focus = ARRAY[
    'Healthcare','Financial Services',
    'Agribusiness','ICT','Manufacturing'
  ],
  impact_objectives = ARRAY[1,2,3]
WHERE fund_name = 'JASMEF 1';

-- BIGGE FUNDS
UPDATE vc_portfolio_funds SET
  fund_category = 'bigge_fund',
  fund_end_date = '2033-05-01',
  is_pvc = false,
  management_fee_pct = 2.0,
  performance_fee_pct = 20.0,
  hurdle_rate_pct = 8.0,
  target_irr_pct = 25.0,
  sector_focus = ARRAY[
    'ICT','Tourism','Logistics',
    'Entertainment','AgriTech'
  ],
  impact_objectives = ARRAY[1,2,3]
WHERE fund_name = 'Caribbean Venture Capital Fund';

-- GROWTH EQUITY FUNDS
UPDATE vc_portfolio_funds SET
  fund_category = 'growth_equity',
  fund_end_date = NULL,
  is_pvc = true,
  management_fee_pct = 2.0,
  performance_fee_pct = 20.0,
  hurdle_rate_pct = 8.0,
  target_irr_pct = 10.0,
  sector_focus = ARRAY[
    'Energy','ICT/BPO','Tourism',
    'Food Service','Financial Services','Logistics'
  ],
  impact_objectives = ARRAY[1,3]
WHERE fund_name = 'Portland JSX';

UPDATE vc_portfolio_funds SET
  fund_category = 'growth_equity',
  fund_end_date = '2029-10-01',
  is_pvc = false,
  management_fee_pct = 2.0,
  performance_fee_pct = 20.0,
  hurdle_rate_pct = 7.0,
  target_irr_pct = 9.11,
  sector_focus = ARRAY[
    'Food Service','Energy','Construction',
    'Logistics','Financial Services',
    'Healthcare','Agribusiness','Tourism',
    'Manufacturing','Retail Distribution'
  ],
  impact_objectives = ARRAY[1,3]
WHERE fund_name = 'SEAF Global SME Growth Investments';

-- PRIVATE CREDIT FUNDS
UPDATE vc_portfolio_funds SET
  fund_category = 'private_credit',
  fund_end_date = NULL,
  is_pvc = true,
  management_fee_pct = 2.0,
  performance_fee_pct = 20.0,
  hurdle_rate_pct = 6.0,
  target_irr_pct = 14.0,
  sector_focus = ARRAY[
    'Water','Energy','ICT/BPO',
    'Logistics','Tourism','Real Estate',
    'Financial Services'
  ],
  impact_objectives = ARRAY[1,3]
WHERE fund_name = 'Caribbean Mezzanine Fund II';

UPDATE vc_portfolio_funds SET
  fund_category = 'private_credit',
  fund_end_date = NULL,
  is_pvc = true,
  management_fee_pct = 1.9,
  performance_fee_pct = 15.0,
  hurdle_rate_pct = 6.0,
  target_irr_pct = 10.0,
  sector_focus = ARRAY[
    'Financial','Distribution','Food Service',
    'Manufacturing','ICT','Mining',
    'Health','Energy','Transport','Tourism'
  ],
  impact_objectives = ARRAY[1,3]
WHERE fund_name = 'Sygnus Credit Investments';

-- INFRASTRUCTURE
UPDATE vc_portfolio_funds SET
  fund_category = 'infrastructure',
  fund_end_date = NULL,
  is_pvc = true,
  management_fee_pct = 1.75,
  performance_fee_pct = 20.0,
  hurdle_rate_pct = 8.0,
  target_irr_pct = 12.0,
  sector_focus = ARRAY['Renewable Energy'],
  impact_objectives = ARRAY[1,3]
WHERE fund_name = 'MPC Caribbean Clean Energy Fund';

-- SPECIAL SITUATION
UPDATE vc_portfolio_funds SET
  fund_category = 'special_situation',
  fund_end_date = '2032-10-01',
  is_pvc = false,
  management_fee_pct = 2.0,
  performance_fee_pct = 20.0,
  hurdle_rate_pct = 8.0,
  target_irr_pct = 21.0,
  sector_focus = ARRAY['Asset Backed Securities'],
  impact_objectives = ARRAY[1,2,3]
WHERE fund_name = 'Quantas Advantage Inc.';

COMMIT;
