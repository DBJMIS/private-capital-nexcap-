'use client';

import Link from 'next/link';

import { CapitalUtilizationBar } from '@/components/investors/CapitalUtilizationBar';
import { INVESTOR_TYPE_LABELS, type InvestorType } from '@/lib/investors/types';
import { cn } from '@/lib/utils';

export type InvestorListRow = {
  id: string;
  name: string;
  investor_type: string;
  country: string | null;
  committed_capital_usd: number;
  deployed_capital_usd: number;
  utilization_percent: number | null;
  flags: string[];
};

export function InvestorCard({ row }: { row: InvestorListRow }) {
  const typeLabel = INVESTOR_TYPE_LABELS[row.investor_type as InvestorType] ?? row.investor_type;
  const under = row.flags.includes('under_deployed');

  return (
    <Link
      href={`/investors/${row.id}`}
      className={cn(
        'block rounded-xl border border-shell-border bg-shell-card p-5 shadow-shell transition-shadow hover:shadow-md',
        under && 'border-amber-300/80 bg-amber-50/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-navy">{row.name}</h3>
          <p className="mt-1 text-xs text-navy/55">{typeLabel}</p>
          {row.country && <p className="mt-0.5 text-xs text-navy/50">{row.country}</p>}
        </div>
        {under && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">Under-deployed</span>
        )}
      </div>
      <div className="mt-4">
        <CapitalUtilizationBar committedUsd={row.committed_capital_usd} deployedUsd={row.deployed_capital_usd} />
      </div>
    </Link>
  );
}
