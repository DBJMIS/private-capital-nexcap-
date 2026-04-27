import type { PipelineRow } from '@/lib/questionnaire/validate';

export type PipelineCompanyDbRow = {
  id: string;
  tenant_id: string;
  questionnaire_id: string;
  sort_order: number;
  company_name: string;
  sector: string | null;
  investment_amount_usd: string | number | null;
  annual_sales_usd: string | number | null;
  leverage: string | null;
  equity_pct: string | number | null;
  negotiation_status: string | null;
  exit_type: string | null;
  exit_notes: string | null;
  investment_thesis: string | null;
  deal_structure_notes: string | null;
};

function numToStr(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return String(v);
}

export function pipelineDbRowToPipelineRow(row: PipelineCompanyDbRow): PipelineRow {
  return {
    id: row.id,
    company_name: row.company_name,
    amount_usd: numToStr(row.investment_amount_usd),
    sector: row.sector ?? '',
    sales_usd: numToStr(row.annual_sales_usd),
    leverage: row.leverage ?? '',
    equity_pct: numToStr(row.equity_pct),
    exit_strategy: row.exit_notes ?? '',
    negotiation_status: row.negotiation_status ?? '',
    exit_type: row.exit_type ?? '',
    exit_notes: row.exit_notes ?? '',
    investment_thesis: row.investment_thesis ?? '',
    deal_structure_notes: row.deal_structure_notes ?? '',
  };
}

function parseUsd(s: string): number | null {
  const t = s.replace(/,/g, '').trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function parsePct(s: string): number | null {
  const t = s.replace(/%/g, '').trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function pipelineRowToDbInsert(params: {
  tenantId: string;
  questionnaireId: string;
  sortOrder: number;
  row: PipelineRow;
}): Record<string, unknown> {
  const { tenantId, questionnaireId, sortOrder, row } = params;
  const base: Record<string, unknown> = {
    tenant_id: tenantId,
    questionnaire_id: questionnaireId,
    sort_order: sortOrder,
    company_name: (row.company_name ?? '').trim(),
    sector: row.sector?.trim() || null,
    investment_amount_usd: parseUsd(row.amount_usd ?? ''),
    annual_sales_usd: parseUsd(row.sales_usd ?? ''),
    leverage: row.leverage?.trim() || null,
    equity_pct: parsePct(row.equity_pct ?? ''),
    negotiation_status: row.negotiation_status?.trim() || null,
    exit_type: row.exit_type?.trim() || null,
    exit_notes: (row.exit_notes ?? row.exit_strategy ?? '').trim() || null,
    investment_thesis: row.investment_thesis?.trim() || null,
    deal_structure_notes: row.deal_structure_notes?.trim() || null,
  };
  if (row.id && UUID_V4.test(row.id)) {
    base.id = row.id;
  }
  return base;
}

export function pipelineRowToDbPatch(row: Partial<PipelineRow>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (row.company_name !== undefined) patch.company_name = row.company_name.trim();
  if (row.sector !== undefined) patch.sector = row.sector.trim() || null;
  if (row.amount_usd !== undefined) patch.investment_amount_usd = parseUsd(row.amount_usd);
  if (row.sales_usd !== undefined) patch.annual_sales_usd = parseUsd(row.sales_usd);
  if (row.leverage !== undefined) patch.leverage = row.leverage.trim() || null;
  if (row.equity_pct !== undefined) patch.equity_pct = parsePct(row.equity_pct);
  if (row.negotiation_status !== undefined) patch.negotiation_status = row.negotiation_status.trim() || null;
  if (row.exit_type !== undefined) patch.exit_type = row.exit_type.trim() || null;
  if (row.exit_notes !== undefined) patch.exit_notes = row.exit_notes.trim() || null;
  if (row.exit_strategy !== undefined && row.exit_notes === undefined) {
    patch.exit_notes = row.exit_strategy.trim() || null;
  }
  if (row.investment_thesis !== undefined) patch.investment_thesis = row.investment_thesis.trim() || null;
  if (row.deal_structure_notes !== undefined) patch.deal_structure_notes = row.deal_structure_notes.trim() || null;
  patch.updated_at = new Date().toISOString();
  return patch;
}
