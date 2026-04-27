/**
 * Metadata for DD structured repeatable lists (normalized tables).
 * File path: lib/questionnaire/structured-list-registry.ts
 */

export type StructuredListKind =
  | 'shareholders'
  | 'investment_professionals'
  | 'support_staff'
  | 'outside_advisors'
  | 'office_locations'
  | 'outsourced_services'
  | 'contact_persons'
  | 'investment_rounds'
  | 'sector_allocations'
  | 'geographic_allocations'
  | 'investment_instruments'
  | 'coinvestors'
  | 'secured_investors'
  | 'potential_investors';

export type StructuredListRegistryEntry = {
  table: string;
  /** Question config key (matches sponsor.ts / routing). */
  questionKey: string;
  sectionKey: 'sponsor' | 'basic_info' | 'investment_strategy' | 'investors_fundraising';
  minRows: number;
  /** URL segment under /api/questionnaires/[id]/... */
  resourceSlug: string;
};

export const STRUCTURED_LIST_REGISTRY: Record<StructuredListKind, StructuredListRegistryEntry> = {
  shareholders: {
    table: 'vc_dd_shareholders',
    questionKey: 'shareholders',
    sectionKey: 'sponsor',
    minRows: 1,
    resourceSlug: 'shareholders',
  },
  investment_professionals: {
    table: 'vc_dd_investment_professionals',
    questionKey: 'investment_professionals',
    sectionKey: 'sponsor',
    /** Empty UI until user adds rows; section completion still requires ≥1 via question.required. */
    minRows: 0,
    resourceSlug: 'investment-professionals',
  },
  support_staff: {
    table: 'vc_dd_support_staff',
    questionKey: 'support_staff',
    sectionKey: 'sponsor',
    minRows: 0,
    resourceSlug: 'support-staff',
  },
  outside_advisors: {
    table: 'vc_dd_advisors',
    questionKey: 'outside_advisors',
    sectionKey: 'sponsor',
    minRows: 0,
    resourceSlug: 'outside-advisors',
  },
  office_locations: {
    table: 'vc_dd_office_locations',
    questionKey: 'office_locations',
    sectionKey: 'sponsor',
    minRows: 0,
    resourceSlug: 'office-locations',
  },
  outsourced_services: {
    table: 'vc_dd_outsourced_services',
    questionKey: 'outsourced_services',
    sectionKey: 'sponsor',
    minRows: 0,
    resourceSlug: 'outsourced-services',
  },
  contact_persons: {
    table: 'vc_dd_contact_persons',
    questionKey: 'contact_persons',
    sectionKey: 'basic_info',
    minRows: 2,
    resourceSlug: 'contact-persons',
  },
  investment_rounds: {
    table: 'vc_dd_investment_rounds',
    questionKey: 'investment_rounds',
    sectionKey: 'investment_strategy',
    minRows: 0,
    resourceSlug: 'investment-rounds',
  },
  sector_allocations: {
    table: 'vc_dd_sector_allocations',
    questionKey: 'sector_allocations',
    sectionKey: 'investment_strategy',
    minRows: 0,
    resourceSlug: 'sector-allocations',
  },
  geographic_allocations: {
    table: 'vc_dd_geographic_allocations',
    questionKey: 'geographic_allocations',
    sectionKey: 'investment_strategy',
    minRows: 0,
    resourceSlug: 'geographic-allocations',
  },
  investment_instruments: {
    table: 'vc_dd_investment_instruments',
    questionKey: 'investment_instruments',
    sectionKey: 'investment_strategy',
    minRows: 0,
    resourceSlug: 'investment-instruments',
  },
  coinvestors: {
    table: 'vc_dd_coinvestors',
    questionKey: 'coinvestors',
    sectionKey: 'investment_strategy',
    minRows: 0,
    resourceSlug: 'coinvestors',
  },
  secured_investors: {
    table: 'vc_dd_secured_investors',
    questionKey: 'secured_investors',
    sectionKey: 'investors_fundraising',
    minRows: 0,
    resourceSlug: 'secured-investors',
  },
  potential_investors: {
    table: 'vc_dd_potential_investors',
    questionKey: 'potential_investors',
    sectionKey: 'investors_fundraising',
    minRows: 0,
    resourceSlug: 'potential-investors',
  },
};

const SLUG_TO_KIND = new Map<string, StructuredListKind>(
  (Object.keys(STRUCTURED_LIST_REGISTRY) as StructuredListKind[]).map((k) => [
    STRUCTURED_LIST_REGISTRY[k].resourceSlug,
    k,
  ]),
);

export function structuredListKindFromResourceSlug(slug: string): StructuredListKind | null {
  return SLUG_TO_KIND.get(slug) ?? null;
}
