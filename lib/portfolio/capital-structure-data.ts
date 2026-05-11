import { num } from '@/lib/portfolio/capital-calls';
import type { CapitalStructureData, Coinvestor } from '@/types/capital-structure';
import type { VcFundCoinvestor } from '@/types/database';

export const PORTFOLIO_LEVERAGE_TARGET = 35;

type FundCapitalSlice = {
  total_fund_commitment: unknown;
  dbj_commitment: unknown;
  dbj_pro_rata_pct: unknown;
  fund_size_status?: string | null;
  fund_close_lp_count?: number | null;
  fund_close_date_actual?: string | null;
  exchange_rate_jmd_usd?: number | null;
  currency: string;
};

export function mapCoinvestorRow(row: VcFundCoinvestor): Coinvestor {
  const amt = row.commitment_amount;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    fund_id: row.fund_id,
    investor_name: row.investor_name,
    investor_type: row.investor_type,
    investor_country: row.investor_country,
    commitment_amount: amt === null || amt === undefined ? null : Number(amt),
    currency: row.currency ?? 'USD',
    commitment_date: row.commitment_date,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function buildCapitalStructureData(fund: FundCapitalSlice, coinvestorRows: VcFundCoinvestor[]): CapitalStructureData {
  const coinvestors = (coinvestorRows ?? []).map((r) => mapCoinvestorRow(r));

  const totalCoinvestorCommitment = coinvestors.reduce((sum, ci) => sum + Number(ci.commitment_amount ?? 0), 0);

  const totalFund = num(fund.total_fund_commitment);
  const dbj = num(fund.dbj_commitment);
  const leverageRatio =
    dbj > 0 && totalFund > 0 ? totalFund / dbj : null;

  const rawStatus = fund.fund_size_status;
  const allowed = new Set(['confirmed', 'estimated', 'sole_investor', 'not_applicable', 'unknown']);
  const fundSizeStatus =
    rawStatus && allowed.has(rawStatus)
      ? (rawStatus as CapitalStructureData['fund_size_status'])
      : null;

  return {
    total_fund_commitment: totalFund,
    dbj_commitment: dbj,
    dbj_pro_rata_pct: num(fund.dbj_pro_rata_pct),
    fund_size_status: fundSizeStatus,
    fund_close_lp_count: fund.fund_close_lp_count ?? null,
    fund_close_date_actual: fund.fund_close_date_actual ?? null,
    exchange_rate_jmd_usd: fund.exchange_rate_jmd_usd ?? null,
    currency: fund.currency,
    coinvestors,
    leverage_ratio: leverageRatio,
    total_coinvestor_commitment: totalCoinvestorCommitment,
    portfolio_leverage_target: PORTFOLIO_LEVERAGE_TARGET,
  };
}
