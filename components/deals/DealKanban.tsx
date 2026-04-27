'use client';

import type { DealCardDeal } from '@/components/deals/DealCard';
import { DealCard } from '@/components/deals/DealCard';

const COLUMNS: { stage: string; title: string }[] = [
  { stage: 'sourced', title: 'Sourced' },
  { stage: 'screening', title: 'Screening' },
  { stage: 'due_diligence', title: 'Due diligence' },
  { stage: 'investment_committee', title: 'IC' },
  { stage: 'approved', title: 'Approved' },
  { stage: 'funded', title: 'Funded' },
  { stage: 'rejected', title: 'Rejected' },
];

export function DealKanban({ deals }: { deals: DealCardDeal[] }) {
  const byStage = (stage: string) => deals.filter((d) => d.stage === stage);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUMNS.map((col) => (
        <div key={col.stage} className="w-64 shrink-0 rounded-xl border border-shell-border bg-white/50 p-2">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-navy/60">
            {col.title}{' '}
            <span className="font-normal text-navy/40">({byStage(col.stage).length})</span>
          </p>
          <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
            {byStage(col.stage).map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
