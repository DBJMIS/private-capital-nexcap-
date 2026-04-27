/**
 * Merge, normalize, and validate onboarding application fields.
 * File path: lib/onboarding/extract.ts
 */

import type { FundApplicationForm, OnboardingAiPayload } from '@/types/onboarding';
import { ONBOARDING_JSON_DELIMITER } from '@/lib/onboarding/constants';

export const DRAFT_STRING_PLACEHOLDER = 'Pending';

export const CORE_KEYS = [
  'fund_name',
  'manager_name',
  'country_of_incorporation',
  'geographic_area',
  'total_capital_commitment_usd',
] as const;

export type CoreKey = (typeof CORE_KEYS)[number];

/** Keys required before submit (DB NOT NULL + business rule commitment > 0). */
export function isApplicationReady(app: Partial<FundApplicationForm>): boolean {
  const nameOk = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.trim() !== DRAFT_STRING_PLACEHOLDER;
  if (!nameOk(app.fund_name)) return false;
  if (!nameOk(app.manager_name)) return false;
  if (!nameOk(app.country_of_incorporation)) return false;
  if (!nameOk(app.geographic_area)) return false;
  const n = app.total_capital_commitment_usd;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return false;
  return true;
}

export function mergeApplications(
  base: Partial<FundApplicationForm>,
  extracted: Partial<FundApplicationForm>,
): Partial<FundApplicationForm> {
  const out: Partial<FundApplicationForm> = { ...base };
  for (const [k, v] of Object.entries(extracted) as [keyof FundApplicationForm, unknown][]) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    (out as Record<string, unknown>)[k] = v as never;
  }
  return out;
}

export function normalizeCommitment(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase().replace(/,/g, '');
    const m = s.match(/^([\d.]+)\s*(m|mm|million|mn)?/i);
    const b = s.match(/^([\d.]+)\s*(b|bn|billion)?/i);
    if (b) {
      const n = parseFloat(b[1]);
      if (!Number.isNaN(n)) return Math.round(n * 1_000_000_000);
    }
    if (m) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n)) return Math.round(n * 1_000_000);
    }
    const plain = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (!Number.isNaN(plain)) return plain;
  }
  return undefined;
}

export function normalizeExtractedFields(raw: Record<string, unknown>): Partial<FundApplicationForm> {
  const out: Partial<FundApplicationForm> = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

  const fund_name = str(raw.fund_name);
  const manager_name = str(raw.manager_name);
  const country_of_incorporation = str(raw.country_of_incorporation);
  const geographic_area = str(raw.geographic_area);
  if (fund_name) out.fund_name = fund_name;
  if (manager_name) out.manager_name = manager_name;
  if (country_of_incorporation) out.country_of_incorporation = country_of_incorporation;
  if (geographic_area) out.geographic_area = geographic_area;

  const commitment =
    normalizeCommitment(raw.total_capital_commitment_usd) ??
    normalizeCommitment(raw.capital_commitment) ??
    num(raw.total_capital_commitment_usd);
  if (commitment !== undefined) out.total_capital_commitment_usd = commitment;

  const investment_stage = str(raw.investment_stage);
  const primary_sector = str(raw.primary_sector);
  if (investment_stage) out.investment_stage = investment_stage;
  if (primary_sector) out.primary_sector = primary_sector;

  const fly = raw.fund_life_years;
  const invp = raw.investment_period_years;
  if (typeof fly === 'number' && Number.isFinite(fly)) out.fund_life_years = fly;
  else if (typeof fly === 'string') {
    const p = parseInt(fly, 10);
    if (!Number.isNaN(p)) out.fund_life_years = p;
  }
  if (typeof invp === 'number' && Number.isFinite(invp)) out.investment_period_years = invp;
  else if (typeof invp === 'string') {
    const p = parseInt(invp, 10);
    if (!Number.isNaN(p)) out.investment_period_years = p;
  }

  return out;
}

export function parseOnboardingAssistantBuffer(full: string): {
  conversational: string;
  payload: OnboardingAiPayload | null;
} {
  const idx = full.indexOf(ONBOARDING_JSON_DELIMITER);
  const conversational = (idx === -1 ? full : full.slice(0, idx)).trimEnd();
  if (idx === -1) {
    return { conversational, payload: null };
  }
  const jsonPart = full.slice(idx + ONBOARDING_JSON_DELIMITER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as OnboardingAiPayload;
    if (!parsed || typeof parsed.reply !== 'string') {
      return { conversational, payload: null };
    }
    parsed.extracted_fields = normalizeExtractedFields(
      (parsed.extracted_fields ?? {}) as Record<string, unknown>,
    );
    if (!Array.isArray(parsed.missing_fields)) parsed.missing_fields = [];
    return { conversational, payload: parsed };
  } catch {
    return { conversational, payload: null };
  }
}

export function followUpsFromPayload(payload: OnboardingAiPayload | null): string[] {
  if (!payload) return [];
  const qs: string[] = [];
  if (payload.next_question && payload.next_question.trim()) {
    qs.push(payload.next_question.trim());
  }
  return qs;
}

/** Build DB row + metadata from wizard state. */
export function toDraftRow(
  tenantId: string,
  userId: string,
  app: Partial<FundApplicationForm>,
  onboardingMetadata: Record<string, unknown>,
) {
  const meta = {
    ...onboardingMetadata,
    investment_stage: app.investment_stage,
    primary_sector: app.primary_sector,
    fund_life_years: app.fund_life_years,
    investment_period_years: app.investment_period_years,
  };
  return {
    tenant_id: tenantId,
    created_by: userId,
    status: 'draft' as const,
    fund_name: (app.fund_name?.trim() || DRAFT_STRING_PLACEHOLDER).slice(0, 500),
    manager_name: (app.manager_name?.trim() || DRAFT_STRING_PLACEHOLDER).slice(0, 500),
    country_of_incorporation: (app.country_of_incorporation?.trim() || DRAFT_STRING_PLACEHOLDER).slice(0, 500),
    geographic_area: (app.geographic_area?.trim() || DRAFT_STRING_PLACEHOLDER).slice(0, 500),
    total_capital_commitment_usd:
      typeof app.total_capital_commitment_usd === 'number' && app.total_capital_commitment_usd > 0
        ? app.total_capital_commitment_usd
        : 0,
    onboarding_metadata: meta,
  };
}
