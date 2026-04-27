/**
 * Pre-screening pass / fail / review evaluation (DBJ rules).
 * File path: lib/pre-screening/evaluate.ts
 */

import type { PreScreeningCategory } from '@/lib/pre-screening/catalog';
import {
  PRE_SCREENING_ITEM_CATALOG,
  PRE_SCREENING_CATEGORY_ORDER,
  CATEGORY_TITLES,
} from '@/lib/pre-screening/catalog';

export type ItemStatus = 'yes' | 'no' | 'pending';

export type PreScreeningItemRow = {
  id: string;
  category: string;
  item_key: string;
  label: string;
  status: ItemStatus;
  notes: string | null;
};

export type CompletionOutcome = 'passed' | 'failed' | 'legal_review_required' | 'incomplete';

export type CategoryProgress = {
  category: PreScreeningCategory;
  title: string;
  total: number;
  answered: number;
  yes: number;
  no: number;
  pending: number;
  complete: boolean;
};

export function categoryProgress(items: PreScreeningItemRow[]): CategoryProgress[] {
  return PRE_SCREENING_CATEGORY_ORDER.map((category) => {
    const catItems = items.filter((i) => i.category === category);
    const total = catItems.length;
    const yes = catItems.filter((i) => i.status === 'yes').length;
    const no = catItems.filter((i) => i.status === 'no').length;
    const pending = catItems.filter((i) => i.status === 'pending').length;
    const answered = yes + no;
    return {
      category,
      title: CATEGORY_TITLES[category],
      total,
      answered,
      yes,
      no,
      pending,
      complete: pending === 0 && total > 0,
    };
  });
}

/** All line items answered (no pending). */
export function allItemsAnswered(items: PreScreeningItemRow[]): boolean {
  const keys = new Set(PRE_SCREENING_ITEM_CATALOG.map((d) => d.item_key));
  const byKey = new Map(items.map((i) => [i.item_key, i]));
  for (const def of PRE_SCREENING_ITEM_CATALOG) {
    const row = byKey.get(def.item_key);
    if (!row || row.status === 'pending') return false;
  }
  return keys.size <= items.length;
}

/** Pass threshold: every item is Yes. */
export function allItemsYes(items: PreScreeningItemRow[]): boolean {
  return PRE_SCREENING_ITEM_CATALOG.every((def) => {
    const row = items.find((i) => i.item_key === def.item_key);
    return row?.status === 'yes';
  });
}

export function anyNoInLegalRegulatory(items: PreScreeningItemRow[]): boolean {
  return items.some((i) => i.category === 'legal_regulatory' && i.status === 'no');
}

/**
 * - incomplete: still pending answers
 * - passed: all Yes (including legal) → auto DD
 * - legal_review_required: all answered, at least one No in legal (flag for officer review)
 * - failed: any No outside legal, or other blocking pattern
 */
export function evaluatePreScreening(items: PreScreeningItemRow[]): CompletionOutcome {
  if (!allItemsAnswered(items)) {
    return 'incomplete';
  }

  if (allItemsYes(items)) {
    return 'passed';
  }

  if (anyNoInLegalRegulatory(items)) {
    return 'legal_review_required';
  }

  return 'failed';
}

/** Map item rows to legacy checklist boolean columns (category “complete” = all Yes in that category). */
export function checklistBooleanColumns(items: PreScreeningItemRow[]) {
  const byCat = (cat: PreScreeningCategory) => items.filter((i) => i.category === cat);
  const allYesIn = (cat: PreScreeningCategory) => {
    const rows = byCat(cat);
    return rows.length > 0 && rows.every((r) => r.status === 'yes');
  };
  return {
    fund_info_complete: allYesIn('fund_information'),
    strategy_complete: allYesIn('fund_strategy'),
    management_complete: allYesIn('fund_management'),
    legal_complete: allYesIn('legal_regulatory'),
  };
}
