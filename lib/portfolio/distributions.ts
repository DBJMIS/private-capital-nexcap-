import type { VcDistribution } from '@/types/database';

import { num, toUsdEquivalent as toUsdEquivalentFromJmd } from '@/lib/portfolio/capital-calls';

export const RETURN_TYPES = [
  'dividend',
  'return_of_capital',
  'capital_gain',
  'interest',
  'other',
] as const;

export type ReturnType = (typeof RETURN_TYPES)[number];

export const RETURN_TYPE_LABELS: Record<ReturnType, string> = {
  dividend: 'Dividend',
  return_of_capital: 'Return of Capital',
  capital_gain: 'Capital Gain',
  interest: 'Interest',
  other: 'Other',
};

export const RETURN_TYPE_BADGES: Record<ReturnType, string> = {
  dividend: 'bg-teal-50 text-teal-700',
  return_of_capital: 'bg-blue-50 text-blue-700',
  capital_gain: 'bg-purple-50 text-purple-700',
  interest: 'bg-amber-50 text-amber-700',
  other: 'bg-gray-100 text-gray-600',
};

export function toUsdEquivalent(amount: number, currency: string, exchangeRateJmdUsd: number | null): number {
  return toUsdEquivalentFromJmd(amount, currency, exchangeRateJmdUsd);
}

export function nextCumulative(rows: { distribution_number: number; amount: unknown }[], distNo: number, amount: number): number {
  const merged = [
    ...rows.map((r) => ({ distribution_number: r.distribution_number, amount: num(r.amount) })),
    { distribution_number: distNo, amount },
  ].sort((a, b) => a.distribution_number - b.distribution_number);

  let acc = 0;
  for (const r of merged) {
    acc += r.amount;
    if (r.distribution_number === distNo) return acc;
  }
  return acc;
}

export function byTypeTotals(rows: VcDistribution[]) {
  const out: Record<ReturnType, number> = {
    dividend: 0,
    return_of_capital: 0,
    capital_gain: 0,
    interest: 0,
    other: 0,
  };
  for (const row of rows) {
    const key = row.return_type as ReturnType;
    if (key in out) out[key] += num(row.amount);
  }
  return out;
}
