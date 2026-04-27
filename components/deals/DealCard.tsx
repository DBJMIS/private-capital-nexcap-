import Link from 'next/link';

import { cn } from '@/lib/utils';

export type DealCardDeal = {
  id: string;
  title: string;
  stage: string;
  assigned_officer: string | null;
  deal_value_usd: number | null;
  application?: { fund_name: string } | null;
};

const STAGE_LABEL: Record<string, string> = {
  sourced: 'Sourced',
  screening: 'Screening',
  due_diligence: 'Due diligence',
  investment_committee: 'Investment committee',
  approved: 'Approved',
  rejected: 'Rejected',
  funded: 'Funded',
};

export function DealCard({ deal, className }: { deal: DealCardDeal; className?: string }) {
  const label = STAGE_LABEL[deal.stage] ?? deal.stage;
  return (
    <Link
      href={`/deals/${deal.id}`}
      className={cn(
        'block rounded-lg border border-shell-border bg-shell-card p-3 shadow-shell transition-shadow hover:shadow-md',
        className,
      )}
    >
      <p className="font-medium text-navy line-clamp-2">{deal.application?.fund_name ?? deal.title}</p>
      <p className="mt-1 text-xs text-navy/50">{label}</p>
      {deal.assigned_officer && (
        <p className="mt-1 text-xs text-navy/60">Officer: {deal.assigned_officer}</p>
      )}
      {deal.deal_value_usd != null && (
        <p className="mt-1 text-xs text-navy/60">${Number(deal.deal_value_usd).toLocaleString('en-US')} USD</p>
      )}
    </Link>
  );
}
