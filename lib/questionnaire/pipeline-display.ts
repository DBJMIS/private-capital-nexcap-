/**
 * Labels and formatting for pipeline UI (Section III).
 * File path: lib/questionnaire/pipeline-display.ts
 */

export const PIPELINE_NEGOTIATION_OPTIONS = [
  { value: 'initial_contact', label: 'Initial contact' },
  { value: 'in_discussion', label: 'In discussion' },
  { value: 'term_sheet', label: 'Term sheet issued' },
  { value: 'due_diligence', label: 'Due diligence ongoing' },
  { value: 'agreed', label: 'Agreed — pending close' },
] as const;

export type PipelineNegotiationValue = (typeof PIPELINE_NEGOTIATION_OPTIONS)[number]['value'];

export const PIPELINE_EXIT_TYPE_OPTIONS = [
  { value: 'ipo', label: 'IPO', sub: '' },
  { value: 'trade_sale', label: 'Trade', sub: 'Sale' },
  { value: 'strategic_acquirer', label: 'Strategic', sub: 'Acquirer' },
  { value: 'mbo_mbi', label: 'MBO /', sub: 'MBI' },
  { value: 'other', label: 'Other', sub: '' },
] as const;

export type PipelineExitTypeValue = (typeof PIPELINE_EXIT_TYPE_OPTIONS)[number]['value'];

const NEG_LABEL = new Map<string, string>(PIPELINE_NEGOTIATION_OPTIONS.map((o) => [o.value, o.label]));

const EXIT_LABEL = new Map<string, string>(
  PIPELINE_EXIT_TYPE_OPTIONS.map((o) => [o.value, o.sub ? `${o.label} ${o.sub}`.trim() : o.label]),
);

export function pipelineNegotiationLabel(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  return NEG_LABEL.get(v) ?? '';
}

export function pipelineExitTypeShortLabel(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  if (v === 'ipo') return 'IPO exit';
  if (v === 'trade_sale') return 'Trade sale';
  if (v === 'strategic_acquirer') return 'Strategic acquirer';
  if (v === 'mbo_mbi') return 'MBO / MBI';
  if (v === 'other') return 'Other';
  return EXIT_LABEL.get(v) ?? '';
}

export function formatPipelineUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const raw = typeof value === 'number' ? String(value) : String(value).replace(/,/g, '').trim();
  if (!raw) return '—';
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
