import { z } from 'zod';

import { extractJsonObject } from '@/lib/prequalification/claude-json';

export const FINANCIAL_SNAPSHOT_REPORT_TYPES = ['quarterly_financial', 'audited_annual'] as const;
export type FinancialSnapshotReportType = (typeof FINANCIAL_SNAPSHOT_REPORT_TYPES)[number];

export type ExtractionConfidenceLevel = 'high' | 'medium' | 'low';

export type SnapshotExtractionConfidence = Partial<Record<string, ExtractionConfidenceLevel>>;

export type SnapshotExtractedFields = {
  period_year: number;
  period_quarter: number;
  snapshot_date: string;
  nav: number;
  committed_capital: number | null;
  distributions_in_period: number | null;
  reported_irr_pct: number | null;
  investor_remark: string | null;
};

const confLevel = z.enum(['high', 'medium', 'low']);

const extractedCoreSchema = z.object({
  period_year: z.number().int().min(2000).max(2100),
  period_quarter: z.number().int().min(1).max(4),
  snapshot_date: z.string().min(10),
  nav: z.number().nonnegative(),
  committed_capital: z.number().nonnegative().nullable().optional(),
  distributions_in_period: z.number().nullable().optional(),
  reported_irr_pct: z.number().min(-100).max(100).nullable().optional(),
  investor_remark: z.string().max(8000).nullable().optional(),
  confidence: z.record(z.string(), confLevel).optional(),
});

function normalizeDate(s: string): string | null {
  const t = s.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildSnapshotExtractionUserPrompt(ctx: {
  period_label: string;
  period_year: number;
  period_month: number;
  report_type: string;
}): string {
  return [
    'You are reading a private equity / venture fund periodic financial report (PDF).',
    'Extract performance figures for our internal quarterly snapshot record.',
    '',
    'Obligation context (hints only; trust the document if it disagrees):',
    `- period_label: ${ctx.period_label}`,
    `- period_year: ${ctx.period_year}`,
    `- period_month: ${ctx.period_month}`,
    `- report_type: ${ctx.report_type}`,
    '',
    'Return a single JSON object with this exact shape (numbers, not strings, for numeric fields):',
    '{',
    '  "period_year": <integer 2000-2100>,',
    '  "period_quarter": <1-4 calendar quarter of the reporting pack>,',
    '  "snapshot_date": "<YYYY-MM-DD> balance sheet / statement date if stated, else best inferred>",',
    '  "nav": <non-negative number: total fund NAV / net assets in fund reporting currency>,',
    '  "committed_capital": <number or null>,',
    '  "distributions_in_period": <number or null: total distributions in the reporting period if clearly stated>,',
    '  "reported_irr_pct": <number between -100 and 100 as a percentage e.g. 12.5 means 12.5%, or null if not stated>,',
    '  "investor_remark": <short string or null: optional one-line note on source/limitations>,',
    '  "confidence": {',
    '    "period_year": "high"|"medium"|"low",',
    '    "period_quarter": "high"|"medium"|"low",',
    '    "snapshot_date": "high"|"medium"|"low",',
    '    "nav": "high"|"medium"|"low",',
    '    "reported_irr_pct": "high"|"medium"|"low",',
    '    "committed_capital": "high"|"medium"|"low",',
    '    "distributions_in_period": "high"|"medium"|"low"',
    '  }',
    '}',
    '',
    'If a value cannot be determined from the document, use null for that field and set its confidence to "low".',
    'Output JSON only — no markdown fences.',
  ].join('\n');
}

export const SNAPSHOT_EXTRACTION_SYSTEM = [
  'You extract structured fund performance data from financial PDFs for analysts.',
  'Respond with one JSON object only. No prose outside JSON.',
].join(' ');

export type ParsedSnapshotExtraction =
  | { ok: true; extracted: SnapshotExtractedFields; confidence: SnapshotExtractionConfidence }
  | { ok: false; error: string };

export function parseSnapshotExtractionModelJson(text: string): ParsedSnapshotExtraction {
  const raw = extractJsonObject(text);
  if (!raw.ok) {
    return { ok: false, error: raw.error };
  }
  const parsed = extractedCoreSchema.safeParse(raw.value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid extraction payload' };
  }
  const v = parsed.data;
  const snap = normalizeDate(v.snapshot_date);
  if (!snap) {
    return { ok: false, error: 'Invalid or missing snapshot_date' };
  }
  const extracted: SnapshotExtractedFields = {
    period_year: v.period_year,
    period_quarter: v.period_quarter,
    snapshot_date: snap,
    nav: v.nav,
    committed_capital: v.committed_capital ?? null,
    distributions_in_period: v.distributions_in_period ?? null,
    reported_irr_pct: v.reported_irr_pct ?? null,
    investor_remark: v.investor_remark?.trim() ? v.investor_remark.trim() : null,
  };
  const confidence: SnapshotExtractionConfidence = v.confidence ?? {};
  return { ok: true, extracted, confidence };
}
