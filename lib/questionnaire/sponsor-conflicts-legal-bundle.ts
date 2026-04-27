/**
 * Keys rendered in the sponsor "Conflicts & legal" composite UI.
 * Sentinel row key in section-layout.
 */

export const SPONSOR_CONFLICTS_LEGAL_LAYOUT_SENTINEL = '__SPONSOR_CONFLICTS_LEGAL__' as const;

export const SPONSOR_CONFLICTS_LEGAL_BUNDLE_KEYS = [
  'has_conflicts_of_interest',
  'conflicts_description',
  'conflicts_resolution',
  'has_regulations',
  'regulations_list',
  'compliance_status',
  'compliance_details',
  'has_litigation',
  'litigation_status',
  'litigation_description',
] as const;
