import type { VcCapitalCall, VcCapitalCallItem } from '@/types/database';

export const PURPOSE_CATEGORY_LABELS: Record<string, string> = {
  management_fee: 'Management Fee',
  organisation_expenses: 'Org. Expenses',
  administration_fee: 'Admin Fee',
  legal_fees: 'Legal Fees',
  director_fees: 'Director Fees',
  regulatory_expenses: 'Regulatory',
  other_fees: 'Other Fees',
  investment: 'Investment',
};

export function num(n: unknown): number {
  return typeof n === 'number' && !Number.isNaN(n) ? n : Number(n);
}

/** Display-only: JMD → USD using fund rate (default 157). */
export function toUsdEquivalent(amount: number, currency: string, exchangeRateJmdUsd: number | null): number {
  if (currency !== 'JMD') return amount;
  const rate = Number(exchangeRateJmdUsd ?? 157) || 157;
  return amount / rate;
}

export function computeRunningForNotice(
  rows: { notice_number: number; call_amount: unknown }[],
  noticeNumber: number,
  callAmount: number,
  dbjCommitment: number,
): { total_called_to_date: number; remaining_commitment: number } {
  const merged = [
    ...rows.map((r) => ({ notice_number: r.notice_number, call_amount: num(r.call_amount) })),
    { notice_number: noticeNumber, call_amount: callAmount },
  ].sort((a, b) => a.notice_number - b.notice_number);

  let acc = 0;
  let totalAtNew = 0;
  for (const r of merged) {
    acc += r.call_amount;
    if (r.notice_number === noticeNumber) totalAtNew = acc;
  }
  return { total_called_to_date: totalAtNew, remaining_commitment: dbjCommitment - totalAtNew };
}

export function aggregateItems(items: VcCapitalCallItem[]) {
  let fees = 0;
  let investments = 0;
  for (const it of items) {
    const a = num(it.amount);
    if (it.purpose_category === 'investment') investments += a;
    else fees += a;
  }
  return { fees_total: fees, investments_total: investments };
}

export function buildCallsWithItems(
  calls: VcCapitalCall[],
  items: VcCapitalCallItem[],
): Array<VcCapitalCall & { items: VcCapitalCallItem[] }> {
  const byCall = new Map<string, VcCapitalCallItem[]>();
  for (const it of items) {
    const list = byCall.get(it.capital_call_id) ?? [];
    list.push(it);
    byCall.set(it.capital_call_id, list);
  }
  for (const list of byCall.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }
  return calls.map((c) => ({ ...c, items: byCall.get(c.id) ?? [] }));
}
