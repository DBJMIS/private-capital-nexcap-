-- Epic 5 seed: real DBJ capital call history (native currency; tenant-specific)
-- Run after portfolio_funds_seed / dev tenant exists.
-- Pure SQL (no DO blocks): avoids SELECT INTO creating a table named v_fund_id when
-- a runner splits on ";" and executes fragments outside PL/pgSQL.

-- ─────────────────────────────────────────────────────
-- STRATUS (JMD) — 1 notice
-- ─────────────────────────────────────────────────────
WITH fund AS (
  SELECT id AS fund_id
  FROM vc_portfolio_funds
  WHERE fund_name = 'NCBCM Stratus Private Equity'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT
    '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid,
    fund_id,
    1,
    '2022-11-30'::date,
    '2022-12-15'::date,
    '2022-12-14'::date,
    90443165,
    'JMD',
    'paid',
    90443165,
    409556920
  FROM fund
  ON CONFLICT (fund_id, notice_number) DO NOTHING
  RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (
  tenant_id, capital_call_id,
  purpose_category, description,
  amount, currency, sort_order
)
SELECT tenant_id, id, 'organisation_expenses', 'Organisation expenses', 15000000, 'JMD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'management_fee', 'Management fee', 12943165, 'JMD', 2 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — AIM', 62500000, 'JMD', 3 FROM new_call;

-- ─────────────────────────────────────────────────────
-- VERTEX (JMD) — 4 notices
-- ─────────────────────────────────────────────────────
WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JMMB-Vertex SME Holdings'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT
    '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 1,
    '2022-09-16'::date, '2022-10-01'::date, '2022-09-30'::date,
    150000000, 'JMD', 'paid', 150000000, 350000000
  FROM fund
  ON CONFLICT (fund_id, notice_number) DO NOTHING
  RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'investment', 'Investment — ICRH', 150000000, 'JMD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JMMB-Vertex SME Holdings'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT
    '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 2,
    '2022-12-01'::date, '2022-12-16'::date, '2022-12-15'::date,
    126498002, 'JMD', 'paid', 276498002, 223501998
  FROM fund
  ON CONFLICT (fund_id, notice_number) DO NOTHING
  RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 16498002, 'JMD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — Corum', 110000000, 'JMD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JMMB-Vertex SME Holdings'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT
    '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 3,
    '2023-03-15'::date, '2023-03-30'::date, '2023-03-29'::date,
    66577896, 'JMD', 'paid', 343075898, 156924102
  FROM fund
  ON CONFLICT (fund_id, notice_number) DO NOTHING
  RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 16577896, 'JMD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — Erin', 50000000, 'JMD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JMMB-Vertex SME Holdings'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT
    '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 4,
    '2023-09-01'::date, '2023-09-16'::date, '2023-09-15'::date,
    96537949, 'JMD', 'paid', 439613847, 60386153
  FROM fund
  ON CONFLICT (fund_id, notice_number) DO NOTHING
  RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 16537949, 'JMD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — Evapolar', 80000000, 'JMD', 2 FROM new_call;

-- ─────────────────────────────────────────────────────
-- JASMEF (USD) — 9 notices
-- ─────────────────────────────────────────────────────
WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 1,
    '2022-10-01'::date, '2022-10-16'::date, '2022-10-14'::date,
    326700, 'USD', 'paid', 326700, 4673300
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'organisation_expenses', 'Organisation expenses', 163350, 'USD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1' AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 2,
    '2022-12-01'::date, '2022-12-16'::date, '2022-12-15'::date,
    816750, 'USD', 'paid', 1143450, 3856550
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — WILCO', 653400, 'USD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1' AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 3,
    '2023-03-01'::date, '2023-03-16'::date, '2023-03-15'::date,
    490050, 'USD', 'paid', 1633500, 3366500
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — TSL', 326700, 'USD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1' AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 4,
    '2023-06-01'::date, '2023-06-16'::date, '2023-06-15'::date,
    163350, 'USD', 'paid', 1796850, 3203150
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1' AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 5,
    '2023-09-01'::date, '2023-09-16'::date, '2023-09-15'::date,
    490050, 'USD', 'paid', 2286900, 2713100
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — BabyLove', 326700, 'USD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1' AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 6,
    '2023-12-01'::date, '2023-12-16'::date, '2023-12-15'::date,
    163350, 'USD', 'paid', 2450250, 2549750
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1' AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 7,
    '2024-03-01'::date, '2024-03-16'::date, '2024-03-15'::date,
    163350, 'USD', 'paid', 2613600, 2386400
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1' AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 8,
    '2024-09-01'::date, '2024-09-16'::date, '2024-09-15'::date,
    163350, 'USD', 'paid', 2776950, 2223050
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'JASMEF 1' AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 9,
    '2025-03-01'::date, '2025-03-16'::date, '2025-03-15'::date,
    163350, 'USD', 'paid', 2940300, 2059700
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 163350, 'USD', 1 FROM new_call;

-- ─────────────────────────────────────────────────────
-- CARIBBEAN VC (USD) — 9 notices
-- ─────────────────────────────────────────────────────
WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 1,
    '2023-06-01'::date, '2023-06-16'::date, '2023-06-15'::date,
    245000, 'USD', 'paid', 245000, 4655000
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'organisation_expenses', 'Organisation expenses', 122500, 'USD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 2,
    '2023-09-01'::date, '2023-09-16'::date, '2023-09-15'::date,
    857000, 'USD', 'paid', 1102000, 3798000
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — Doorstep', 734500, 'USD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 3,
    '2023-12-01'::date, '2023-12-16'::date, '2023-12-15'::date,
    122500, 'USD', 'paid', 1224500, 3675500
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 4,
    '2024-03-01'::date, '2024-03-16'::date, '2024-03-15'::date,
    122500, 'USD', 'paid', 1347000, 3553000
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 5,
    '2024-06-01'::date, '2024-06-16'::date, '2024-06-15'::date,
    856500, 'USD', 'paid', 2203500, 2696500
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 1 FROM new_call
UNION ALL
SELECT tenant_id, id, 'investment', 'Investment — SunTerra', 734000, 'USD', 2 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 6,
    '2024-09-01'::date, '2024-09-16'::date, '2024-09-15'::date,
    122500, 'USD', 'paid', 2326000, 2574000
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 7,
    '2024-12-01'::date, '2024-12-16'::date, '2024-12-15'::date,
    122500, 'USD', 'paid', 2448500, 2451500
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 8,
    '2025-03-01'::date, '2025-03-16'::date, '2025-03-15'::date,
    122500, 'USD', 'paid', 2571000, 2329000
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 1 FROM new_call;

WITH fund AS (
  SELECT id AS fund_id FROM vc_portfolio_funds
  WHERE fund_name = 'Caribbean Venture Capital Fund'
    AND tenant_id = '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid
),
new_call AS (
  INSERT INTO vc_capital_calls (
    tenant_id, fund_id, notice_number,
    date_of_notice, due_date, date_paid,
    call_amount, currency, status,
    total_called_to_date, remaining_commitment
  )
  SELECT '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1'::uuid, fund_id, 9,
    '2025-09-01'::date, '2025-09-16'::date, NULL,
    122500, 'USD', 'overdue', 2693500, 2206500
  FROM fund ON CONFLICT (fund_id, notice_number) DO NOTHING RETURNING id, tenant_id
)
INSERT INTO vc_capital_call_items (tenant_id, capital_call_id, purpose_category, description, amount, currency, sort_order)
SELECT tenant_id, id, 'management_fee', 'Management fee', 122500, 'USD', 1 FROM new_call;
