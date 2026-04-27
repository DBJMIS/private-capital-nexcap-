/**
 * Human-readable audit event copy for timelines and exports.
 * File path: lib/audit/format.ts
 */

import { normalizeEntityType } from '@/lib/audit/types';
import { formatDateTime } from '@/lib/format-date';

export type AuditLogRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_state: unknown;
  after_state: unknown;
  metadata: unknown;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Title line for timeline card */
export function formatAuditTitle(row: AuditLogRow): string {
  const et = normalizeEntityType(row.entity_type);
  const action = row.action.replace(/_/g, ' ');
  const entityLabel: Record<string, string> = {
    fund_application: 'Fund application',
    pre_screening: 'Pre-screening',
    dd_questionnaire: 'Due diligence',
    assessment: 'Assessment',
    deal: 'Deal',
    investment: 'Investment',
    disbursement: 'Disbursement',
    approval: 'Approval',
    task: 'Task',
    investor: 'Investor',
    vc_deal: 'Deal',
    vc_fund_application: 'Fund application',
    vc_approval: 'Approval',
  };
  const prefix = entityLabel[row.entity_type] ?? entityLabel[et] ?? et;
  return `${prefix}: ${capitalizeWords(action)}`;
}

function capitalizeWords(s: string): string {
  return s
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Short subtitle (actor + relative context) */
export function formatAuditSubtitle(row: AuditLogRow): string {
  const who = row.actor_name?.trim() || row.actor_email?.trim() || 'System';
  const ts = formatDateTime(row.created_at);
  return `${who} · ${ts}`;
}

type DiffLine = { field: string; before: string; after: string };

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Key field changes for status / amounts / scores */
export function diffAuditStates(row: AuditLogRow): DiffLine[] {
  const before = asRecord(row.before_state);
  const after = asRecord(row.after_state);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const lines: DiffLine[] = [];
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    lines.push({ field: k, before: fmtVal(b), after: fmtVal(a) });
  }
  return lines.slice(0, 15);
}
