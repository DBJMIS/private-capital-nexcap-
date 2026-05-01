DO $$
DECLARE
  v_fund_id uuid;
  v_tenant uuid := '12ed8a76-bca0-4f93-8aba-7c0d425d6bb1';
BEGIN
  SELECT id INTO v_fund_id
  FROM vc_portfolio_funds
  WHERE fund_name = 'JMMB-Vertex SME Holdings'
    AND tenant_id = v_tenant;

  IF v_fund_id IS NOT NULL THEN
    INSERT INTO vc_divestments (
      tenant_id,
      fund_id,
      company_name,
      divestment_type,
      completion_date,
      original_investment_amount,
      proceeds_received,
      currency,
      is_full_exit,
      remaining_stake_pct,
      notes,
      status
    )
    VALUES (
      v_tenant,
      v_fund_id,
      'ICRH',
      'partial_exit',
      '2025-09-30',
      150000000,
      41919000,
      'JMD',
      false,
      75.0,
      'Partial exit from ICRH. Capital gain distributed to LPs in September 2025.',
      'completed'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
