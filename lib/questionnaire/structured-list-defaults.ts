/**
 * Default empty rows for structured DD lists (client + server).
 * File path: lib/questionnaire/structured-list-defaults.ts
 */

import type { StructuredListKind } from '@/lib/questionnaire/structured-list-registry';
import { STRUCTURED_LIST_REGISTRY } from '@/lib/questionnaire/structured-list-registry';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function emptyStructuredListRow(kind: StructuredListKind): Record<string, unknown> {
  const id = newId();
  switch (kind) {
    case 'shareholders':
      return { id, full_name: '', occupation: '' };
    case 'investment_professionals':
      return {
        id,
        full_name: '',
        title: '',
        position_status: 'full_time',
        time_dedication_pct: '',
        hire_timeline: '',
        bio_id: null,
      };
    case 'support_staff':
      return { id, full_name: '', position: '', time_dedication_pct: '', bio_id: null, department: '' };
    case 'outside_advisors':
      return { id, full_name: '', role: '', remuneration: '', paid_by: '' };
    case 'office_locations':
      return { id, address: '', activities: '', staff_count: '' };
    case 'outsourced_services':
      return { id, company_name: '', activities: '', annual_cost_usd: '', paid_by: '' };
    case 'contact_persons':
      return { id, name: '', email: '', phone: '' };
    case 'investment_rounds':
      return { id, round_name: '', min_usd: '', max_usd: '' };
    case 'sector_allocations':
      return { id, sector_name: '', max_pct: '' };
    case 'geographic_allocations':
      return { id, region_country: '', max_pct: '' };
    case 'investment_instruments':
      return { id, instrument_name: '', fund_pct: '', legal_notes: '' };
    case 'coinvestors':
      return { id, company_name: '', contact_name: '', phone: '', email: '' };
    case 'secured_investors':
      return { id, investor_name: '', amount_usd: '', description: '' };
    case 'potential_investors':
      return { id, investor_name: '', expected_amount_usd: '', timeline: '' };
    default:
      return { id };
  }
}

export function ensureMinStructuredRows(kind: StructuredListKind, rows: unknown[]): Record<string, unknown>[] {
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const min = STRUCTURED_LIST_REGISTRY[kind].minRows;
  if (list.length >= min) return list.map((r) => ({ ...r, id: r.id ?? newId() }));
  const pad = Array.from({ length: min - list.length }, () => emptyStructuredListRow(kind));
  return [...list.map((r) => ({ ...r, id: r.id ?? newId() })), ...pad];
}
