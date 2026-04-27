/**
 * Canonical audit entity types and actions for the DBJ VC platform.
 * File path: lib/audit/types.ts
 */

export type AuditEntityType =
  | 'fund_application'
  | 'pre_screening'
  | 'dd_questionnaire'
  | 'assessment'
  | 'deal'
  | 'investment'
  | 'disbursement'
  | 'approval'
  | 'task'
  | 'investor';

/** Legacy DB values still readable via RLS / UI */
const LEGACY_ENTITY_TYPE_ALIASES: Record<string, string> = {
  vc_deal: 'deal',
  vc_fund_application: 'fund_application',
  vc_approval: 'approval',
};

export function normalizeEntityType(raw: string): string {
  return LEGACY_ENTITY_TYPE_ALIASES[raw] ?? raw;
}
