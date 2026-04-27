import { cn } from '@/lib/utils';

/** Values stored in `vc_portfolio_funds.fund_category`. */
export type FundCategoryValue =
  | 'sme_fund'
  | 'growth_equity'
  | 'private_credit'
  | 'infrastructure'
  | 'special_situation'
  | 'angel'
  | 'bigge_fund';

export const FUND_CATEGORY_GROUP_ORDER: (FundCategoryValue | '__uncat__')[] = [
  'sme_fund',
  'growth_equity',
  'private_credit',
  'infrastructure',
  'special_situation',
  'bigge_fund',
  'angel',
  '__uncat__',
];

export const FUND_CATEGORY_FILTER_OPTIONS: { value: 'all' | FundCategoryValue; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'sme_fund', label: 'SME Funds' },
  { value: 'growth_equity', label: 'Growth Equity' },
  { value: 'private_credit', label: 'Private Credit' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'special_situation', label: 'Special Situation' },
  { value: 'bigge_fund', label: 'Bigge Funds' },
];

export function fundCategoryLabel(cat: string | null | undefined): string {
  switch (cat) {
    case 'sme_fund':
      return 'SME Fund';
    case 'growth_equity':
      return 'Growth Equity';
    case 'private_credit':
      return 'Private Credit';
    case 'infrastructure':
      return 'Infrastructure';
    case 'special_situation':
      return 'Special Situation';
    case 'bigge_fund':
      return 'Bigge Fund';
    case 'angel':
      return 'Angel';
    default:
      return 'Uncategorised';
  }
}

function fundCategoryColorClass(cat: string | null | undefined): string {
  switch (cat) {
    case 'sme_fund':
      return 'bg-blue-50 text-blue-700';
    case 'growth_equity':
      return 'bg-purple-50 text-purple-700';
    case 'private_credit':
      return 'bg-amber-50 text-amber-700';
    case 'infrastructure':
      return 'bg-teal-50 text-teal-700';
    case 'special_situation':
      return 'bg-orange-50 text-orange-700';
    case 'bigge_fund':
      return 'bg-indigo-50 text-indigo-700';
    case 'angel':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

/** Small pill badge for tables and fund rows. */
export function fundCategoryBadgeClassName(cat: string | null | undefined, opts?: { withMarginTop?: boolean }): string {
  return cn(
    'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
    opts?.withMarginTop && 'mt-1',
    fundCategoryColorClass(cat),
  );
}
