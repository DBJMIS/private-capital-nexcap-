/**
 * Keys rendered inside the sponsor "Alignment & compensation" composite UI.
 * Sentinel row key in section-layout: __SPONSOR_ALIGNMENT_COMP__.
 */

export const SPONSOR_ALIGNMENT_LAYOUT_SENTINEL = '__SPONSOR_ALIGNMENT_COMP__' as const;

export const SPONSOR_ALIGNMENT_BUNDLE_KEYS = [
  'manager_will_invest',
  'manager_investment_amount',
  'manager_investment_pct',
  'manager_investment_method',
  'compensation_structure',
  'outsourced_services',
  'other_business_activities_yes',
  'other_activities',
  'outside_contracts_yes',
  'outside_contracts',
] as const;

export type SponsorAlignmentBundleKey = (typeof SPONSOR_ALIGNMENT_BUNDLE_KEYS)[number];
