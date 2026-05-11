export type FundSizeStatus =
  | 'confirmed'
  | 'estimated'
  | 'sole_investor'
  | 'not_applicable'
  | 'unknown';

export interface Coinvestor {
  id: string;
  tenant_id: string;
  fund_id: string;
  investor_name: string;
  investor_type: string | null;
  investor_country: string | null;
  commitment_amount: number | null;
  currency: string;
  commitment_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapitalStructureData {
  total_fund_commitment: number;
  dbj_commitment: number;
  dbj_pro_rata_pct: number;
  fund_size_status: FundSizeStatus | null;
  fund_close_lp_count: number | null;
  fund_close_date_actual: string | null;
  exchange_rate_jmd_usd: number | null;
  currency: string;
  coinvestors: Coinvestor[];
  leverage_ratio: number | null;
  total_coinvestor_commitment: number;
  portfolio_leverage_target: number;
}
