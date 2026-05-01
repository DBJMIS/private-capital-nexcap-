export const USD_EQ_RATE = 157;

export const DIVESTMENT_TYPES = [
  'full_exit',
  'partial_exit',
  'ipo',
  'write_off',
  'return_of_capital',
  'management_buyout',
  'secondary_sale',
] as const;

export const DIVESTMENT_STATUSES = ['pending', 'completed', 'cancelled'] as const;

export type DivestmentType = (typeof DIVESTMENT_TYPES)[number];
export type DivestmentStatus = (typeof DIVESTMENT_STATUSES)[number];

export type DivestmentRow = {
  id: string;
  tenant_id: string;
  fund_id: string;
  company_name: string;
  divestment_type: DivestmentType;
  announcement_date: string | null;
  completion_date: string;
  original_investment_amount: number;
  proceeds_received: number;
  currency: 'USD' | 'JMD';
  multiple_on_invested_capital: number | null;
  is_full_exit: boolean;
  remaining_stake_pct: number | null;
  exit_route: string | null;
  notes: string | null;
  buyer_name: string | null;
  status: DivestmentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DivestmentSummary = {
  total_exits: number;
  total_proceeds_usd: number;
  avg_moic: number;
  by_type: Record<string, number>;
  by_fund: Array<{ fund_id: string; fund_name: string; count: number; total_proceeds: number }>;
};

export function toUsd(amount: number, currency: 'USD' | 'JMD'): number {
  if (currency === 'JMD') return amount / USD_EQ_RATE;
  return amount;
}

export function summarizeDivestments(
  rows: DivestmentRow[],
  fundsById: Map<string, { fund_name: string }>,
): DivestmentSummary {
  const total_exits = rows.filter((r) => r.status === 'completed').length;
  let total_proceeds_usd = 0;
  let moicWeightedNumerator = 0;
  let moicWeightedDenominator = 0;
  const by_type: Record<string, number> = {};
  const byFundMap = new Map<string, { fund_id: string; fund_name: string; count: number; total_proceeds: number }>();

  for (const row of rows) {
    by_type[row.divestment_type] = (by_type[row.divestment_type] ?? 0) + 1;
    total_proceeds_usd += toUsd(Number(row.proceeds_received ?? 0), row.currency);

    if (row.multiple_on_invested_capital != null && Number(row.original_investment_amount) > 0) {
      const invested = Number(row.original_investment_amount);
      moicWeightedNumerator += Number(row.multiple_on_invested_capital) * invested;
      moicWeightedDenominator += invested;
    }

    const fund = byFundMap.get(row.fund_id) ?? {
      fund_id: row.fund_id,
      fund_name: fundsById.get(row.fund_id)?.fund_name ?? 'Fund',
      count: 0,
      total_proceeds: 0,
    };
    fund.count += 1;
    fund.total_proceeds += Number(row.proceeds_received ?? 0);
    byFundMap.set(row.fund_id, fund);
  }

  const avg_moic = moicWeightedDenominator > 0 ? moicWeightedNumerator / moicWeightedDenominator : 0;

  return {
    total_exits,
    total_proceeds_usd,
    avg_moic,
    by_type,
    by_fund: [...byFundMap.values()].sort((a, b) => b.total_proceeds - a.total_proceeds),
  };
}

export const DIVESTMENT_SELECT =
  'id, tenant_id, fund_id, company_name, divestment_type, announcement_date, completion_date, original_investment_amount, proceeds_received, currency, multiple_on_invested_capital, is_full_exit, remaining_stake_pct, exit_route, notes, buyer_name, status, created_by, created_at, updated_at';
