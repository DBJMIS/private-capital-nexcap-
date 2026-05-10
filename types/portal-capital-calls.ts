export type PortalCapitalCallItemDto = {
  id: string;
  description: string;
  amount: number;
};

export type PortalCapitalCallDto = {
  id: string;
  call_amount: number;
  currency: string;
  due_date: string | null;
  date_of_notice: string;
  date_paid: string | null;
  notice_number: number | null;
  total_called_to_date: number | null;
  remaining_commitment: number | null;
  status: string;
  notes: string | null;
  items: PortalCapitalCallItemDto[];
};

export type PortalCapitalCallsPortfolioFundDto = {
  id: string;
  fund_name: string;
  dbj_commitment: number | null;
  currency: string;
};

export type PortalCapitalCallsSummaryDto = {
  total_called: number;
  total_remaining_commitment: number;
  call_count: number;
  currency: string;
};

export type PortalCapitalCallsResponse = {
  portfolio_fund: PortalCapitalCallsPortfolioFundDto | null;
  summary: PortalCapitalCallsSummaryDto;
  capital_calls: PortalCapitalCallDto[];
};
