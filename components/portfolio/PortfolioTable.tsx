'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PerformanceBadge } from '@/components/portfolio/PerformanceBadge';
import { Button } from '@/components/ui/button';
import type { PerformanceBand } from '@/lib/portfolio/types';
import { formatShortDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

export type PortfolioTableRow = {
  id: string;
  fund_name: string;
  sector: string;
  approved_amount_usd: number;
  performance_score: number | null;
  last_snapshot_date: string | null;
  performance_band: PerformanceBand;
};

type SortKey = 'fund_name' | 'sector' | 'approved_amount_usd' | 'performance_score' | 'last_snapshot_date';

export function PortfolioTable({ rows }: { rows: PortfolioTableRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('fund_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let av: string | number | null = a[sortKey] as string | number | null;
      let bv: string | number | null = b[sortKey] as string | number | null;
      if (sortKey === 'fund_name' || sortKey === 'sector') {
        av = String(av ?? '').toLowerCase();
        bv = String(bv ?? '').toLowerCase();
      }
      if (sortKey === 'performance_score') {
        const an = a.performance_score;
        const bn = b.performance_score;
        if (an == null && bn == null) return 0;
        if (an == null) return 1;
        if (bn == null) return -1;
        av = an;
        bv = bn;
      }
      if (sortKey === 'last_snapshot_date') {
        const ad = a.last_snapshot_date ? new Date(a.last_snapshot_date).getTime() : 0;
        const bd = b.last_snapshot_date ? new Date(b.last_snapshot_date).getTime() : 0;
        av = ad;
        bv = bd;
      }
      if (av === bv) return 0;
      const cmp = av! < bv! ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'approved_amount_usd' || key === 'performance_score' ? 'desc' : 'asc');
    }
  };

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th className={cn(align === 'right' && 'text-right')}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7280] hover:bg-transparent hover:text-navy',
          align === 'left' && '-ml-2',
          align === 'right' && '-mr-2 inline-flex w-full justify-end',
        )}
        onClick={() => toggle(key)}
      >
        {label}
        {sortKey === key && <span className="ml-1 text-[10px] font-normal normal-case text-[#9ca3af]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </Button>
    </th>
  );

  return (
    <div className="app-table-wrap">
      <table className="app-table min-w-[720px]">
        <thead>
          <tr>
            {th('fund_name', 'Investment')}
            {th('sector', 'Sector')}
            {th('approved_amount_usd', 'Amount (USD)', 'right')}
            {th('performance_score', 'Score', 'right')}
            {th('last_snapshot_date', 'Last updated')}
            <th>Status</th>
            <th className="text-right"> </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} className="h-auto py-8 text-center text-[13px] text-[#9ca3af]">
                No investments match the filters.
              </td>
            </tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.id} className="group">
                <td className="font-medium text-navy">{r.fund_name}</td>
                <td className="text-[#374151]">{r.sector}</td>
                <td className="text-right font-mono tabular-nums text-[#374151]">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                    r.approved_amount_usd,
                  )}
                </td>
                <td className="text-right font-mono tabular-nums text-[#374151]">
                  {r.performance_score != null ? r.performance_score.toFixed(1) : '—'}
                </td>
                <td className="text-[#374151]">
                  {r.last_snapshot_date ? formatShortDate(r.last_snapshot_date) : '—'}
                </td>
                <td>
                  <PerformanceBadge band={r.performance_band} />
                </td>
                <td className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    asChild
                  >
                    <Link href={`/investments/${r.id}`}>View</Link>
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
