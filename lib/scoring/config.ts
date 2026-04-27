/**
 * DBJ weighted assessment criteria (exact weights and subcriteria max points).
 * File path: lib/scoring/config.ts
 */

export type CriteriaKey =
  | 'firm'
  | 'fundraising'
  | 'team'
  | 'investment_strategy'
  | 'investment_process'
  | 'representative_pipeline'
  | 'governance';

export type SubcriteriaDef = {
  key: string;
  label: string;
  maxPoints: number;
};

export type CriteriaDef = {
  key: CriteriaKey;
  title: string;
  /** Weight as percent of 100 (e.g. 12 = 12%) */
  weightPercent: number;
  subcriteria: SubcriteriaDef[];
};

export const PASS_THRESHOLD = 70;

export const CRITERIA_ORDER: CriteriaKey[] = [
  'firm',
  'fundraising',
  'team',
  'investment_strategy',
  'investment_process',
  'representative_pipeline',
  'governance',
];

export const ASSESSMENT_CRITERIA: CriteriaDef[] = [
  {
    key: 'firm',
    title: 'Firm',
    weightPercent: 12,
    subcriteria: [
      { key: 'sme_experience', label: 'Experience with SME investment and finance', maxPoints: 6 },
      { key: 'financial_strength', label: 'Financial strength', maxPoints: 3 },
      { key: 'business_network', label: 'Quality of firm business network', maxPoints: 3 },
    ],
  },
  {
    key: 'fundraising',
    title: 'Fundraising',
    weightPercent: 18,
    subcriteria: [
      { key: 'financial_commitment', label: 'Financial commitment to the fund', maxPoints: 6 },
      { key: 'raise_existing', label: 'Ability to fundraise from existing clients/investors', maxPoints: 4 },
      { key: 'raise_new', label: 'Ability to fundraise from new investors', maxPoints: 4 },
      { key: 'fundraising_strategy', label: 'Fundraising strategy', maxPoints: 4 },
    ],
  },
  {
    key: 'team',
    title: 'Team',
    weightPercent: 20,
    subcriteria: [
      { key: 'individual_experience', label: 'Individual experience of team members', maxPoints: 2 },
      { key: 'work_together', label: 'Previous work together of team members', maxPoints: 4 },
      { key: 'dedication', label: 'Dedication of team to the fund', maxPoints: 3 },
      { key: 'complementarity', label: 'Complementarity of team skills', maxPoints: 2 },
      { key: 'remuneration_retention', label: 'Remuneration and retention policy', maxPoints: 3 },
      { key: 'personal_commitments', label: 'Personal commitments by team members to fund capital', maxPoints: 3 },
      { key: 'capacity_commitments', label: 'Evidence of capacity to meet capital commitments', maxPoints: 3 },
    ],
  },
  {
    key: 'investment_strategy',
    title: 'Investment Strategy',
    weightPercent: 10,
    subcriteria: [
      { key: 'pipeline_development', label: 'Pipeline development', maxPoints: 1 },
      { key: 'deal_negotiation', label: 'Deal negotiation and structuring', maxPoints: 2 },
      { key: 'portfolio_management', label: 'Portfolio management', maxPoints: 3 },
      { key: 'exit_strategy', label: 'Exit strategy', maxPoints: 2 },
      { key: 'esg_impact', label: 'ESG/Impact strategy', maxPoints: 2 },
    ],
  },
  {
    key: 'investment_process',
    title: 'Investment Process',
    weightPercent: 15,
    subcriteria: [
      { key: 'lead_generation', label: 'Lead generation', maxPoints: 1 },
      { key: 'screening', label: 'Screening', maxPoints: 1 },
      { key: 'due_diligence', label: 'Due diligence', maxPoints: 2 },
      { key: 'value_addition', label: 'Value addition plans for portfolio companies', maxPoints: 5 },
      { key: 'grooming_exit', label: 'Grooming companies for exit', maxPoints: 2 },
      { key: 'reporting_systems', label: 'Reporting systems for portfolio companies', maxPoints: 2 },
      { key: 'crisis_management', label: 'Crisis management of troubled portfolio company', maxPoints: 2 },
    ],
  },
  {
    key: 'representative_pipeline',
    title: 'Representative Pipeline',
    weightPercent: 15,
    subcriteria: [
      { key: 'number_quality', label: 'Number and quality of companies', maxPoints: 3 },
      { key: 'negotiation_status', label: 'Negotiation status', maxPoints: 6 },
      { key: 'thesis_per_company', label: 'Developed information and investment thesis per company', maxPoints: 6 },
    ],
  },
  {
    key: 'governance',
    title: 'Governance',
    weightPercent: 10,
    subcriteria: [
      { key: 'shareholder_structure', label: 'Shareholder structure of fund manager', maxPoints: 2 },
      { key: 'investment_committee', label: 'Composition and rules of Investment Committee', maxPoints: 2 },
      { key: 'advisory_board', label: 'Composition and rules of Advisory Board', maxPoints: 2 },
      { key: 'conflict_resolution', label: 'Conflict resolution mechanisms', maxPoints: 2 },
      { key: 'reporting_valuation', label: 'Fund reporting & valuation', maxPoints: 1 },
      { key: 'pri_esg', label: 'Adherence to PRI and ESG good practice', maxPoints: 1 },
    ],
  },
];

const byKey = new Map(ASSESSMENT_CRITERIA.map((c) => [c.key, c]));

export function getCriteriaDef(key: CriteriaKey): CriteriaDef | undefined {
  return byKey.get(key);
}

export function sectionMaxPoints(key: CriteriaKey): number {
  const c = byKey.get(key);
  return c ? c.subcriteria.reduce((s, sc) => s + sc.maxPoints, 0) : 0;
}

export function totalMaxPoints(): number {
  return ASSESSMENT_CRITERIA.reduce((s, c) => s + sectionMaxPoints(c.key), 0);
}
