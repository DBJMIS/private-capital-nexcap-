import { DBJ_INVESTMENT_CRITERIA } from '@/lib/cfp/dbj-criteria';

/** Minimum fund target (USD) from CFP JSON or DBJ defaults. */
export function effectiveMinFundSizeUsd(cfpInvestmentCriteria: unknown): number {
  if (cfpInvestmentCriteria && typeof cfpInvestmentCriteria === 'object' && !Array.isArray(cfpInvestmentCriteria)) {
    const raw = (cfpInvestmentCriteria as Record<string, unknown>).fund_target_size_min_usd;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DBJ_INVESTMENT_CRITERIA.fund_target_size_min_usd;
}

/** Shallow-merge CFP criteria over DBJ defaults (for future rules). */
export function mergeInvestmentCriteriaWithDefaults(cfpInvestmentCriteria: unknown): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(DBJ_INVESTMENT_CRITERIA)) as Record<string, unknown>;
  if (cfpInvestmentCriteria && typeof cfpInvestmentCriteria === 'object' && !Array.isArray(cfpInvestmentCriteria)) {
    return { ...base, ...(cfpInvestmentCriteria as Record<string, unknown>) };
  }
  return base;
}
