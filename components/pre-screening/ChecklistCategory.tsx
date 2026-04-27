'use client';

import type { PreScreeningCategory } from '@/lib/pre-screening/catalog';
import { CATEGORY_TITLES } from '@/lib/pre-screening/catalog';

import {
  ChecklistItem,
  type ChecklistItemData,
  type ChecklistItemProps,
} from '@/components/pre-screening/ChecklistItem';

export type CategoryProgressSlice = {
  category: PreScreeningCategory;
  total: number;
  answered: number;
};

export type ChecklistCategoryProps = {
  category: PreScreeningCategory;
  items: ChecklistItemData[];
  progress?: CategoryProgressSlice;
  disabled?: boolean;
  onUpdateItem: ChecklistItemProps['onUpdate'];
};

export function ChecklistCategory({
  category,
  items,
  progress,
  disabled,
  onUpdateItem,
}: ChecklistCategoryProps) {
  const title = CATEGORY_TITLES[category];
  const answered = progress?.answered ?? items.filter((i) => i.status !== 'pending').length;
  const total = progress?.total ?? items.length;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-shell-border pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gold">{title}</h2>
        <p className="text-xs text-navy/60">
          {answered} of {total} answered
          <span className="ml-2 text-teal">({pct}%)</span>
        </p>
      </div>
      <div
        className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-navy/10"
        role="progressbar"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-teal transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.item_key}>
            <ChecklistItem item={it} disabled={disabled} onUpdate={onUpdateItem} />
          </li>
        ))}
      </ul>
    </section>
  );
}
