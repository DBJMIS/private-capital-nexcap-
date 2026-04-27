export type PanelRating = 'S' | 'R' | 'W' | 'I';

export type PanelCriterion = {
  key: string;
  label: string;
  category: string;
};

export type PanelCriterionGroup = {
  category: string;
  items: Array<{ key: string; label: string }>;
};

export const PANEL_SCORING_GROUPS: PanelCriterionGroup[] = [
  {
    category: 'FIRM',
    items: [
      { key: 'firm_long_term_strategy', label: 'Long term strategy' },
      { key: 'firm_pe_vc_experience', label: 'PE/VC experience' },
      { key: 'firm_financial_strength', label: 'Financial strength' },
      { key: 'firm_manager_commitment', label: 'Manager commitment' },
      { key: 'firm_management_style', label: 'Management style' },
      { key: 'firm_networking_quality', label: 'Networking quality' },
    ],
  },
  {
    category: 'TEAM',
    items: [
      { key: 'team_fund_dedication', label: 'Fund dedication' },
      { key: 'team_qualifications', label: 'Team qualifications' },
      { key: 'team_individual_experience', label: 'Individual experience' },
      { key: 'team_time_together', label: 'Time working together' },
      { key: 'team_thesis_adherence', label: 'Thesis adherence' },
      { key: 'team_retention_policy', label: 'Retention policy' },
    ],
  },
  {
    category: 'INVESTMENT THESIS',
    items: [
      { key: 'thesis_investment_strategy', label: 'Investment strategy' },
      { key: 'thesis_sector_focus', label: 'Sector focus' },
      { key: 'thesis_regional_focus', label: 'Regional focus / Jamaica %' },
      { key: 'thesis_proposal_attractiveness', label: 'Proposal attractiveness' },
    ],
  },
  {
    category: 'INVESTMENT PROCESS',
    items: [
      { key: 'process_in_place', label: 'Process in place' },
      { key: 'process_pipeline_origination', label: 'Pipeline origination' },
      { key: 'process_value_added', label: 'Value added' },
      { key: 'process_exit_strategy_consistency', label: 'Exit strategy consistency' },
    ],
  },
  {
    category: 'FINANCIALS',
    items: [
      { key: 'financial_cost_structure', label: 'Cost structure' },
      { key: 'financial_fee_structure', label: 'Fee structure' },
      { key: 'financial_fundraising_status', label: 'Fundraising status' },
    ],
  },
  {
    category: 'PIPELINE',
    items: [
      { key: 'pipeline_company_quality', label: 'Company quality' },
      { key: 'pipeline_negotiation_status', label: 'Negotiation status' },
      { key: 'pipeline_innovation_edge', label: 'Innovation/competitive edge' },
    ],
  },
  {
    category: 'GOVERNANCE',
    items: [
      { key: 'governance_structure', label: 'Governance structure' },
      { key: 'governance_conflict_resolution', label: 'Conflict resolution' },
      { key: 'governance_documents_presented', label: 'Documents presented' },
    ],
  },
  {
    category: 'GENERAL',
    items: [
      { key: 'general_proposal_structure', label: 'Proposal structure' },
      { key: 'general_presentation_quality', label: 'Presentation quality' },
      { key: 'general_monitoring_framework', label: 'Monitoring framework' },
      { key: 'general_panel_eligibility', label: 'Panel eligibility' },
      { key: 'general_esg_engagement', label: 'ESG engagement' },
    ],
  },
];

export const PANEL_CRITERIA: PanelCriterion[] = PANEL_SCORING_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ category: group.category, ...item })),
);

/** Total panel scoring criteria (S/R/W/I per criterion). */
export const PANEL_CRITERIA_COUNT = PANEL_CRITERIA.length;

export const PANEL_CRITERION_KEYS = new Set(PANEL_CRITERIA.map((c) => c.key));
