'use client';

import { useCallback, useEffect, useState } from 'react';
import { HandCoins, LayoutGrid } from 'lucide-react';

import { DealKanban } from '@/components/deals/DealKanban';
import type { DealCardDeal } from '@/components/deals/DealCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { dsCard, dsTable, dsType } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';

export function DealsListClient() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [deals, setDeals] = useState<DealCardDeal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch('/api/deals?limit=500');
      const j = (await res.json()) as { deals?: DealCardDeal[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to load deals');
        setDeals([]);
        return;
      }
      setDeals(j.deals ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className={dsType.muted}>Loading deals…</p>;
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{err}</div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={view === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => setView('kanban')}>
          Kanban
        </Button>
        <Button type="button" variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setView('table')}>
          Table
        </Button>
      </div>
      {view === 'kanban' ? (
        deals.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No deals in the pipeline"
            subtitle="Approve an application with assessment ≥ 70 and completed due diligence to open a deal."
          />
        ) : (
          <DealKanban deals={deals} />
        )
      ) : deals.length === 0 ? (
        <div className={cn(dsCard.shell)}>
          <EmptyState
            icon={HandCoins}
            title="No deals yet"
            subtitle="Approve an application for the pipeline."
            className="py-12"
          />
        </div>
      ) : (
        <div className={dsTable.container}>
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full">
              <thead className={dsTable.thead}>
                <tr>
                  <th className={dsTable.th}>Fund</th>
                  <th className={dsTable.th}>Stage</th>
                  <th className={dsTable.th}>Officer</th>
                  <th className={cn(dsTable.th, 'text-right')}>Value (USD)</th>
                  <th className={cn(dsTable.th, 'text-right')} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {deals.map((d) => (
                  <tr key={d.id} className={dsTable.rowHover}>
                    <td className={cn(dsTable.td, 'font-medium text-[#0B1F45]')}>{d.application?.fund_name ?? d.title}</td>
                    <td className={dsTable.td}>
                      <StatusBadge status={String(d.stage)} />
                    </td>
                    <td className={dsTable.td}>{d.assigned_officer ?? '—'}</td>
                    <td className={cn(dsTable.td, 'text-right font-mono tabular-nums')}>
                      {d.deal_value_usd != null ? `$${Number(d.deal_value_usd).toLocaleString('en-US')}` : '—'}
                    </td>
                    <td className={cn(dsTable.td, 'text-right')}>
                      <ActionButton href={`/deals/${d.id}`}>Open</ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
