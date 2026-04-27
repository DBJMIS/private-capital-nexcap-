/**
 * Parse pipeline company JSON from API requests.
 * File path: lib/questionnaire/pipeline-api-body.ts
 */

import type { PipelineRow } from '@/lib/questionnaire/validate';

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Create a row for insert (id may be empty; DB generates if omitted). */
export function pipelineRowFromPostBody(body: unknown): { row?: PipelineRow; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid JSON body' };
  const b = body as Record<string, unknown>;
  const company_name = str(b.company_name).trim();
  if (!company_name) return { error: 'company_name is required' };

  const row: PipelineRow = {
    id: str(b.id).trim(),
    company_name,
    sector: str(b.sector).trim(),
    amount_usd: str(b.amount_usd),
    sales_usd: str(b.sales_usd),
    leverage: str(b.leverage),
    equity_pct: str(b.equity_pct),
    negotiation_status: str(b.negotiation_status).trim(),
    exit_type: str(b.exit_type).trim(),
    exit_notes: str(b.exit_notes),
    exit_strategy: str(b.exit_strategy),
    investment_thesis: str(b.investment_thesis),
    deal_structure_notes: str(b.deal_structure_notes),
  };
  return { row };
}

export function partialPipelineRowFromPatchBody(body: unknown): { patch?: Partial<PipelineRow>; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid JSON body' };
  const b = body as Record<string, unknown>;
  const patch: Partial<PipelineRow> = {};
  if ('company_name' in b) patch.company_name = str(b.company_name);
  if ('sector' in b) patch.sector = str(b.sector);
  if ('amount_usd' in b) patch.amount_usd = str(b.amount_usd);
  if ('sales_usd' in b) patch.sales_usd = str(b.sales_usd);
  if ('leverage' in b) patch.leverage = str(b.leverage);
  if ('equity_pct' in b) patch.equity_pct = str(b.equity_pct);
  if ('negotiation_status' in b) patch.negotiation_status = str(b.negotiation_status);
  if ('exit_type' in b) patch.exit_type = str(b.exit_type);
  if ('exit_notes' in b) patch.exit_notes = str(b.exit_notes);
  if ('exit_strategy' in b) patch.exit_strategy = str(b.exit_strategy);
  if ('investment_thesis' in b) patch.investment_thesis = str(b.investment_thesis);
  if ('deal_structure_notes' in b) patch.deal_structure_notes = str(b.deal_structure_notes);
  return { patch };
}
