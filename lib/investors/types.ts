export const INVESTOR_TYPES = [
  'multilateral',
  'government',
  'private',
  'development_bank',
  'pension_fund',
  'other',
] as const;

export type InvestorType = (typeof INVESTOR_TYPES)[number];

export const INVESTOR_TYPE_LABELS: Record<InvestorType, string> = {
  multilateral: 'Multilateral (e.g. IDB, IFC, EIB)',
  government: 'Government (e.g. GOJ, ministries)',
  private: 'Private sector',
  development_bank: 'Development bank',
  pension_fund: 'Pension fund',
  other: 'Other',
};
