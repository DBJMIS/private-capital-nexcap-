/**
 * DBJ investment criteria defaults (Appendix 5.2 — process manual).
 * Used as defaults for CFP `investment_criteria` JSON.
 */
export const DBJ_INVESTMENT_CRITERIA = {
  fund_target_size_min_usd: 20_000_000,
  dbj_participation_max_pct: 25,
  dbj_participation_max_usd: 450_000,
  manager_commitment_min_pct: 2,
  jamaica_allocation_min_pct: 40,
  private_capital_min_pct: 20,
  fund_duration_min_years: 7,
  focus_sectors: [
    'Agriculture and Agribusiness',
    'Energy',
    'Information Technology and Communication',
    'Animation',
    'Creative Industries',
    'Nutraceuticals/Pharmaceuticals',
    'Logistics',
    'Tourism',
    'Infrastructure',
    'Real Estate',
  ],
  legal_structures: ['Company', 'Limited Liability Partnership', 'Other'],
  stage_focus: [
    'Innovative start-up companies',
    'Venture capital funds',
    'Growth/Expansion capital',
    'Private Equity funds',
  ],
} as const;

export type DbjInvestmentCriteria = typeof DBJ_INVESTMENT_CRITERIA;
