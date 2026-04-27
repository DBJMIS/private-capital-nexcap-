import { z } from 'zod';

import { extractJsonObject } from '@/lib/prequalification/claude-json';
import type { VcFundNarrativeExtract } from '@/types/database';

export type NarrativeConfidence = 'high' | 'medium' | 'low' | 'not_found';

const confidenceEnum = z.enum(['high', 'medium', 'low', 'not_found']);
const turnoverEnum = z.enum(['none', 'resolved', 'ongoing', 'severe']).nullable();
const fundraisingStatusEnum = z.enum(['fully_raised', 'shortfall', 'extended', 'closed']).nullable();
const auditStatusEnum = z.enum(['current', 'delayed', 'outstanding']).nullable();

/** Structured fund profile from the quarterly report (stored in `fund_profile` JSONB). */
export type NarrativeExtractFundProfile = {
  fund_vintage: number | null;
  fund_size: { currency: string; amount: number } | null;
  first_close: string | null;
  fund_life_years: number | null;
  final_close: string | null;
  year_end: string | null;
  fund_strategy_summary: string | null;
};

export type NarrativeExtractAllocations = {
  sector: Array<{ name: string; percentage: number }> | null;
  geographic: Array<{ country: string; percentage: number }> | null;
};

export type NarrativeExtractLpRow = {
  name: string;
  commitment: { currency: string; amount: number } | null;
  percentage: number;
};

export type NarrativeExtractPipelineStats = {
  deal_count: number | null;
  pipeline_value: { currency: string; amount: number } | null;
  largest_sectors: string[] | null;
  term_sheets_issued: number | null;
  term_sheets_value: { currency: string; amount: number } | null;
};

export type NarrativeExtractCapitalAccountDetail = {
  portfolio_drawdowns: { currency: string; amount: number } | null;
  fee_drawdowns: { currency: string; amount: number } | null;
  management_fees: { currency: string; amount: number } | null;
  administrative_fees: { currency: string; amount: number } | null;
  other_fund_fees: { currency: string; amount: number } | null;
};

export const NARRATIVE_EXTRACTION_SYSTEM = [
  'You extract structured narrative sections, indicator fields, and structured fund data from private capital quarterly reports.',
  'Return a single JSON object only, with no markdown.',
  'Use null for unknown values. Keep extracted narrative concise and factual.',
  'Include source_snippets as direct 10-25 word quotes from the source document for each supported narrative field.',
  'For fund_profile, allocations, fund_lps, pipeline_stats, and capital_account_detail: extract only what is explicitly supported by the document.',
  'Look for tables showing fund LP ownership with percentages; sector/industry allocation in pie charts or tables; geographic or country allocation breakdowns.',
  'Look for fund profile details: vintage year, first close date, fund life, final close, fiscal year end, and a short strategy summary if stated.',
  'Extract pipeline statistics: number of deals, total pipeline value, dominant sectors, term sheets issued and their aggregate value if stated.',
  'Extract fee breakdown from Fund Capital Account or similar sections (portfolio vs fee drawdowns, management, administrative, other fees).',
  'For every scalar or structured field in fund_profile, allocations, fund_lps, pipeline_stats, and capital_account_detail, include a matching key in "confidence" with value high, medium, low, or not_found.',
  'If the document does not contain a field, return null for that field and set confidence for that field to not_found — do not fabricate.',
].join(' ');

export type NarrativeExtractionPayload = {
  narrative: {
    fundraising_update: string | null;
    pipeline_development: string | null;
    team_update: string | null;
    compliance_update: string | null;
    impact_update: string | null;
    risk_assessment: string | null;
    outlook: string | null;
  };
  indicators: {
    team_size: number | null;
    team_turnover: 'none' | 'resolved' | 'ongoing' | 'severe' | null;
    fundraising_status: 'fully_raised' | 'shortfall' | 'extended' | 'closed' | null;
    fundraising_raised_pct: number | null;
    pipeline_count: number | null;
    pipeline_value: number | null;
    audit_status: 'current' | 'delayed' | 'outstanding' | null;
    jamaica_focus: boolean | null;
    sme_focus: boolean | null;
    investments_made: number | null;
  };
  fund_profile: NarrativeExtractFundProfile | null;
  allocations: NarrativeExtractAllocations | null;
  fund_lps: NarrativeExtractLpRow[] | null;
  pipeline_stats: NarrativeExtractPipelineStats | null;
  capital_account_detail: NarrativeExtractCapitalAccountDetail | null;
  confidence: Record<string, NarrativeConfidence>;
  source_snippets: Partial<Record<'fundraising_update' | 'pipeline_development' | 'team_update' | 'compliance_update' | 'impact_update' | 'risk_assessment' | 'outlook', string>>;
};

/** API response shape for POST extract-narrative and PATCH narrative-extracts. */
export type NarrativeExtractApiResponse = NarrativeExtractionPayload & {
  narrative_extract_id: string;
};

function parseMoney(v: unknown): { currency: string; amount: number } | null {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const cur = typeof o.currency === 'string' ? o.currency : '';
  const amt = typeof o.amount === 'number' && Number.isFinite(o.amount) ? o.amount : Number(o.amount);
  if (!cur || !Number.isFinite(amt)) return null;
  return { currency: cur, amount: amt };
}

function normalizeFundProfile(raw: unknown): NarrativeExtractFundProfile | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const fv = o.fund_vintage;
  const fund_vintage = typeof fv === 'number' && Number.isFinite(fv) ? fv : null;
  const fl = o.fund_life_years;
  const fund_life_years = typeof fl === 'number' && Number.isFinite(fl) ? fl : null;
  return {
    fund_vintage,
    fund_size: parseMoney(o.fund_size),
    first_close: typeof o.first_close === 'string' ? o.first_close.trim() || null : null,
    fund_life_years,
    final_close: typeof o.final_close === 'string' ? o.final_close.trim() || null : null,
    year_end: typeof o.year_end === 'string' ? o.year_end.trim() || null : null,
    fund_strategy_summary: typeof o.fund_strategy_summary === 'string' ? o.fund_strategy_summary.trim() || null : null,
  };
}

function normalizeAllocations(raw: unknown): NarrativeExtractAllocations | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const parseRows = <T extends { name?: string; country?: string; percentage: number }>(
    arr: unknown,
    key: 'name' | 'country',
  ): T[] | null => {
    if (!Array.isArray(arr)) return null;
    const out: T[] = [];
    for (const row of arr) {
      if (row == null || typeof row !== 'object' || Array.isArray(row)) continue;
      const r = row as Record<string, unknown>;
      const label = typeof r[key] === 'string' ? (r[key] as string).trim() : '';
      const p = typeof r.percentage === 'number' ? r.percentage : Number(r.percentage);
      if (!label || !Number.isFinite(p)) continue;
      out.push({ [key]: label, percentage: p } as T);
    }
    return out.length ? out : null;
  };
  const sector = parseRows<{ name: string; percentage: number }>(o.sector, 'name');
  const geographic = parseRows<{ country: string; percentage: number }>(o.geographic, 'country');
  if (!sector && !geographic) return null;
  return { sector, geographic };
}

function normalizeFundLps(raw: unknown): NarrativeExtractLpRow[] | null {
  if (!Array.isArray(raw)) return null;
  const out: NarrativeExtractLpRow[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    const pct = typeof r.percentage === 'number' ? r.percentage : Number(r.percentage);
    if (!Number.isFinite(pct)) continue;
    out.push({ name, commitment: parseMoney(r.commitment), percentage: pct });
  }
  return out.length ? out : null;
}

function normalizePipelineStats(raw: unknown): NarrativeExtractPipelineStats | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const dc = o.deal_count;
  const deal_count = typeof dc === 'number' && Number.isFinite(dc) ? dc : null;
  const ts = o.term_sheets_issued;
  const term_sheets_issued = typeof ts === 'number' && Number.isFinite(ts) ? ts : null;
  let largest_sectors: string[] | null = null;
  if (Array.isArray(o.largest_sectors)) {
    const xs = o.largest_sectors.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
    largest_sectors = xs.length ? xs : null;
  }
  const empty =
    deal_count == null &&
    parseMoney(o.pipeline_value) == null &&
    !largest_sectors?.length &&
    term_sheets_issued == null &&
    parseMoney(o.term_sheets_value) == null;
  if (empty) return null;
  return {
    deal_count,
    pipeline_value: parseMoney(o.pipeline_value),
    largest_sectors,
    term_sheets_issued,
    term_sheets_value: parseMoney(o.term_sheets_value),
  };
}

function normalizeCapitalAccount(raw: unknown): NarrativeExtractCapitalAccountDetail | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: NarrativeExtractCapitalAccountDetail = {
    portfolio_drawdowns: parseMoney(o.portfolio_drawdowns),
    fee_drawdowns: parseMoney(o.fee_drawdowns),
    management_fees: parseMoney(o.management_fees),
    administrative_fees: parseMoney(o.administrative_fees),
    other_fund_fees: parseMoney(o.other_fund_fees),
  };
  if (
    !out.portfolio_drawdowns &&
    !out.fee_drawdowns &&
    !out.management_fees &&
    !out.administrative_fees &&
    !out.other_fund_fees
  ) {
    return null;
  }
  return out;
}

const schema = z
  .object({
    narrative: z
      .object({
        fundraising_update: z.string().nullable().optional(),
        pipeline_development: z.string().nullable().optional(),
        team_update: z.string().nullable().optional(),
        compliance_update: z.string().nullable().optional(),
        impact_update: z.string().nullable().optional(),
        risk_assessment: z.string().nullable().optional(),
        outlook: z.string().nullable().optional(),
      })
      .partial()
      .default({}),
    indicators: z
      .object({
        team_size: z.number().nullable().optional(),
        team_turnover: turnoverEnum.optional(),
        fundraising_status: fundraisingStatusEnum.optional(),
        fundraising_raised_pct: z.number().nullable().optional(),
        pipeline_count: z.number().nullable().optional(),
        pipeline_value: z.number().nullable().optional(),
        audit_status: auditStatusEnum.optional(),
        jamaica_focus: z.boolean().nullable().optional(),
        sme_focus: z.boolean().nullable().optional(),
        investments_made: z.number().nullable().optional(),
      })
      .partial()
      .default({}),
    fund_profile: z.unknown().optional(),
    allocations: z.unknown().optional(),
    fund_lps: z.unknown().optional(),
    pipeline_stats: z.unknown().optional(),
    capital_account_detail: z.unknown().optional(),
    confidence: z.record(z.string(), confidenceEnum).optional(),
    source_snippets: z
      .object({
        fundraising_update: z.string().optional(),
        pipeline_development: z.string().optional(),
        team_update: z.string().optional(),
        compliance_update: z.string().optional(),
        impact_update: z.string().optional(),
        risk_assessment: z.string().optional(),
        outlook: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

const STRUCTURAL_CONFIDENCE_KEYS: string[] = [
  'fund_profile.fund_vintage',
  'fund_profile.fund_size',
  'fund_profile.first_close',
  'fund_profile.fund_life_years',
  'fund_profile.final_close',
  'fund_profile.year_end',
  'fund_profile.fund_strategy_summary',
  'allocations.sector',
  'allocations.geographic',
  'fund_lps',
  'pipeline_stats.deal_count',
  'pipeline_stats.pipeline_value',
  'pipeline_stats.largest_sectors',
  'pipeline_stats.term_sheets_issued',
  'pipeline_stats.term_sheets_value',
  'capital_account_detail.portfolio_drawdowns',
  'capital_account_detail.fee_drawdowns',
  'capital_account_detail.management_fees',
  'capital_account_detail.administrative_fees',
  'capital_account_detail.other_fund_fees',
];

function mergeConfidence(base: Record<string, NarrativeConfidence>): Record<string, NarrativeConfidence> {
  const out: Record<string, NarrativeConfidence> = { ...base };
  for (const k of STRUCTURAL_CONFIDENCE_KEYS) {
    if (out[k] == null) out[k] = 'not_found';
  }
  return out;
}

function clean(v: string | null | undefined): string | null {
  const x = v?.trim();
  return x ? x : null;
}

export function buildNarrativeExtractionUserPrompt(context: {
  fundName: string;
  periodLabel: string;
  reportType: string;
}): string {
  return [
    `Fund: ${context.fundName}`,
    `Reporting period: ${context.periodLabel}`,
    `Report type: ${context.reportType}`,
    '',
    'Extract and return JSON with this exact shape:',
    '{',
    '  "narrative": {',
    '    "fundraising_update": string|null,',
    '    "pipeline_development": string|null,',
    '    "team_update": string|null,',
    '    "compliance_update": string|null,',
    '    "impact_update": string|null,',
    '    "risk_assessment": string|null,',
    '    "outlook": string|null',
    '  },',
    '  "indicators": {',
    '    "team_size": number|null,',
    '    "team_turnover": "none"|"resolved"|"ongoing"|"severe"|null,',
    '    "fundraising_status": "fully_raised"|"shortfall"|"extended"|"closed"|null,',
    '    "fundraising_raised_pct": number|null,',
    '    "pipeline_count": number|null,',
    '    "pipeline_value": number|null,',
    '    "audit_status": "current"|"delayed"|"outstanding"|null,',
    '    "jamaica_focus": boolean|null,',
    '    "sme_focus": boolean|null,',
    '    "investments_made": number|null',
    '  },',
    '  "fund_profile": {',
    '    "fund_vintage": number|null,',
    '    "fund_size": { "currency": "USD"|"JMD", "amount": number }|null,',
    '    "first_close": string|null,',
    '    "fund_life_years": number|null,',
    '    "final_close": string|null,',
    '    "year_end": string|null,',
    '    "fund_strategy_summary": string|null',
    '  }|null,',
    '  "allocations": {',
    '    "sector": [{ "name": string, "percentage": number }]|null,',
    '    "geographic": [{ "country": string, "percentage": number }]|null',
    '  }|null,',
    '  "fund_lps": [{ "name": string, "commitment": { "currency": string, "amount": number }|null, "percentage": number }]|null,',
    '  "pipeline_stats": {',
    '    "deal_count": number|null,',
    '    "pipeline_value": { "currency": string, "amount": number }|null,',
    '    "largest_sectors": string[]|null,',
    '    "term_sheets_issued": number|null,',
    '    "term_sheets_value": { "currency": string, "amount": number }|null',
    '  }|null,',
    '  "capital_account_detail": {',
    '    "portfolio_drawdowns": { "currency": string, "amount": number }|null,',
    '    "fee_drawdowns": { "currency": string, "amount": number }|null,',
    '    "management_fees": { "currency": string, "amount": number }|null,',
    '    "administrative_fees": { "currency": string, "amount": number }|null,',
    '    "other_fund_fees": { "currency": string, "amount": number }|null',
    '  }|null,',
    '  "confidence": { "<field_path>": "high"|"medium"|"low"|"not_found" },',
    '  "source_snippets": {',
    '    "fundraising_update"?: string,',
    '    "pipeline_development"?: string,',
    '    "team_update"?: string,',
    '    "compliance_update"?: string,',
    '    "impact_update"?: string,',
    '    "risk_assessment"?: string,',
    '    "outlook"?: string',
    '  }',
    '}',
    '',
    'Do not invent facts. Use null when absent.',
  ].join('\n');
}

export function parseNarrativeExtractionPayload(
  value: unknown,
): { ok: true; data: NarrativeExtractionPayload } | { ok: false; error: string } {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid narrative extraction payload' };
  }
  const d = parsed.data as z.infer<typeof schema>;
  const narr = d.narrative ?? {};
  const ind = d.indicators ?? {};
  const fund_profile = normalizeFundProfile(d.fund_profile);
  const allocations = normalizeAllocations(d.allocations);
  const fund_lps = normalizeFundLps(d.fund_lps);
  const pipeline_stats = normalizePipelineStats(d.pipeline_stats);
  const capital_account_detail = normalizeCapitalAccount(d.capital_account_detail);
  const confidenceIn = (d.confidence ?? {}) as Record<string, NarrativeConfidence>;
  const confidence = mergeConfidence(confidenceIn);

  return {
    ok: true,
    data: {
      narrative: {
        fundraising_update: clean(narr.fundraising_update),
        pipeline_development: clean(narr.pipeline_development),
        team_update: clean(narr.team_update),
        compliance_update: clean(narr.compliance_update),
        impact_update: clean(narr.impact_update),
        risk_assessment: clean(narr.risk_assessment),
        outlook: clean(narr.outlook),
      },
      indicators: {
        team_size: ind.team_size ?? null,
        team_turnover: ind.team_turnover ?? null,
        fundraising_status: ind.fundraising_status ?? null,
        fundraising_raised_pct: ind.fundraising_raised_pct ?? null,
        pipeline_count: ind.pipeline_count ?? null,
        pipeline_value: ind.pipeline_value ?? null,
        audit_status: ind.audit_status ?? null,
        jamaica_focus: ind.jamaica_focus ?? null,
        sme_focus: ind.sme_focus ?? null,
        investments_made: ind.investments_made ?? null,
      },
      fund_profile,
      allocations,
      fund_lps,
      pipeline_stats,
      capital_account_detail,
      confidence,
      source_snippets: d.source_snippets ?? {},
    },
  };
}

export function parseNarrativeExtractionModelJson(text: string): { ok: true; data: NarrativeExtractionPayload } | { ok: false; error: string } {
  const raw = extractJsonObject(text);
  if (!raw.ok) return { ok: false, error: raw.error };
  return parseNarrativeExtractionPayload(raw.value);
}

/** Build merge input from a DB row (for PATCH with partial body). */
export function narrativeExtractRowToMergeInput(row: VcFundNarrativeExtract): Record<string, unknown> {
  const ind = row.indicators && typeof row.indicators === 'object' && !Array.isArray(row.indicators) ? row.indicators : {};
  const conf = row.extraction_confidence && typeof row.extraction_confidence === 'object' && !Array.isArray(row.extraction_confidence)
    ? row.extraction_confidence
    : {};
  const snip = row.source_snippets && typeof row.source_snippets === 'object' && !Array.isArray(row.source_snippets) ? row.source_snippets : {};
  return {
    narrative: {
      fundraising_update: row.fundraising_update,
      pipeline_development: row.pipeline_development,
      team_update: row.team_update,
      compliance_update: row.compliance_update,
      impact_update: row.impact_update,
      risk_assessment: row.risk_assessment,
      outlook: row.outlook,
    },
    indicators: ind,
    fund_profile: row.fund_profile,
    allocations: row.allocations,
    fund_lps: row.fund_lps,
    pipeline_stats: row.pipeline_stats,
    capital_account_detail: row.capital_account_detail,
    confidence: conf,
    source_snippets: snip,
  };
}

export function mergeNarrativeExtractMergeInput(base: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const p = patch as Record<string, unknown>;
  const baseN =
    base.narrative && typeof base.narrative === 'object' && !Array.isArray(base.narrative) ? (base.narrative as Record<string, unknown>) : {};
  const baseI =
    base.indicators && typeof base.indicators === 'object' && !Array.isArray(base.indicators) ? (base.indicators as Record<string, unknown>) : {};
  const baseC =
    base.confidence && typeof base.confidence === 'object' && !Array.isArray(base.confidence) ? (base.confidence as Record<string, unknown>) : {};
  const baseS =
    base.source_snippets && typeof base.source_snippets === 'object' && !Array.isArray(base.source_snippets)
      ? (base.source_snippets as Record<string, unknown>)
      : {};
  const pn = p.narrative && typeof p.narrative === 'object' && !Array.isArray(p.narrative) ? (p.narrative as Record<string, unknown>) : {};
  const pi = p.indicators && typeof p.indicators === 'object' && !Array.isArray(p.indicators) ? (p.indicators as Record<string, unknown>) : {};
  const pc = p.confidence && typeof p.confidence === 'object' && !Array.isArray(p.confidence) ? (p.confidence as Record<string, unknown>) : {};
  const ps =
    p.source_snippets && typeof p.source_snippets === 'object' && !Array.isArray(p.source_snippets) ? (p.source_snippets as Record<string, unknown>) : {};
  return {
    narrative: { ...baseN, ...pn },
    indicators: { ...baseI, ...pi },
    fund_profile: 'fund_profile' in p ? p.fund_profile : base.fund_profile,
    allocations: 'allocations' in p ? p.allocations : base.allocations,
    fund_lps: 'fund_lps' in p ? p.fund_lps : base.fund_lps,
    pipeline_stats: 'pipeline_stats' in p ? p.pipeline_stats : base.pipeline_stats,
    capital_account_detail: 'capital_account_detail' in p ? p.capital_account_detail : base.capital_account_detail,
    confidence: { ...baseC, ...pc },
    source_snippets: { ...baseS, ...ps },
  };
}
