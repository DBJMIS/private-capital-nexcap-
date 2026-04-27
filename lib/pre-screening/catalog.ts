/**
 * DBJ Pre-Screening Checklist definitions (institutional form).
 * File path: lib/pre-screening/catalog.ts
 */

export type PreScreeningCategory =
  | 'fund_information'
  | 'fund_strategy'
  | 'fund_management'
  | 'legal_regulatory';

export type PreScreeningItemDefinition = {
  category: PreScreeningCategory;
  item_key: string;
  label: string;
};

export const PRE_SCREENING_ITEM_CATALOG: PreScreeningItemDefinition[] = [
  {
    category: 'fund_information',
    item_key: 'management_company_name',
    label: 'Name of Management Company',
  },
  {
    category: 'fund_information',
    item_key: 'administration_company_name',
    label: 'Name of Administration Company',
  },
  {
    category: 'fund_information',
    item_key: 'responsible_persons',
    label: 'Name of person(s) responsible',
  },
  {
    category: 'fund_information',
    item_key: 'legal_structure',
    label: 'Legal Structure (Corporation / Partnership / Trust)',
  },
  {
    category: 'fund_strategy',
    item_key: 'objective_sector_scope',
    label: 'Objective: target sector, local / regional / international',
  },
  {
    category: 'fund_strategy',
    item_key: 'max_min_investment_by_sector',
    label: 'Proposed max / min investment by sector',
  },
  {
    category: 'fund_strategy',
    item_key: 'max_min_single_investee',
    label: 'Max / min investment in a single investee company',
  },
  {
    category: 'fund_strategy',
    item_key: 'target_investee_count',
    label: 'Number of investee companies targeted',
  },
  {
    category: 'fund_strategy',
    item_key: 'participation_stakes',
    label: 'Participation: majority / minority stakes',
  },
  {
    category: 'fund_strategy',
    item_key: 'investee_company_size',
    label: 'Size of investee companies at time of investment',
  },
  {
    category: 'fund_management',
    item_key: 'fund_duration',
    label: 'Duration of fund',
  },
  {
    category: 'fund_management',
    item_key: 'investment_divestment_period',
    label: 'Investment and divestment period',
  },
  {
    category: 'fund_management',
    item_key: 'target_fund_size_min_max',
    label: 'Target min / max fund size',
  },
  {
    category: 'fund_management',
    item_key: 'admin_performance_fees',
    label: 'Admin and performance fees',
  },
  {
    category: 'fund_management',
    item_key: 'fundraising_target',
    label: 'Fundraising target',
  },
  {
    category: 'fund_management',
    item_key: 'fundraising_stage',
    label: 'Stage of fundraising',
  },
  {
    category: 'fund_management',
    item_key: 'mgmt_company_capital_commitment',
    label: 'Management company capital commitment',
  },
  {
    category: 'legal_regulatory',
    item_key: 'proof_incorporation_articles',
    label: 'Proof of incorporation + Articles',
  },
  {
    category: 'legal_regulatory',
    item_key: 'fsc_accreditation_status',
    label: 'FSC accreditation proof or application status',
  },
];

export const PRE_SCREENING_CATEGORY_ORDER: PreScreeningCategory[] = [
  'fund_information',
  'fund_strategy',
  'fund_management',
  'legal_regulatory',
];

export const CATEGORY_TITLES: Record<PreScreeningCategory, string> = {
  fund_information: 'FUND INFORMATION',
  fund_strategy: 'FUND STRATEGY',
  fund_management: 'FUND MANAGEMENT',
  legal_regulatory: 'LEGAL & REGULATORY',
};
