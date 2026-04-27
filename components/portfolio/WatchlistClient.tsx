'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import type { WatchlistFundRow } from '@/lib/portfolio/types';

function rowTone(r: WatchlistFundRow): string {
  if (r.watchlist.escalated) return 'bg-red-50/90';
  const rec = (r.last_divestment_recommendation ?? '').toLowerCase();
  if (rec === 'divest') return 'bg-red-50/50';
  if (rec === 'freeze') return 'bg-orange-50/80';
  if (rec === 'watchlist') return 'bg-amber-50/70';
  return 'bg-white';
}

export function WatchlistClient() {
  const [rows, setRows] = useState<WatchlistFundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const res = await fetch('/api/portfolio/watchlist');
    const j = (await res.json()) as { rows?: WatchlistFundRow[]; error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load watchlist');
      setRows([]);
    } else {
      setRows(j.rows ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Fund</th>
              <th className="px-4 py-3">On watchlist since</th>
              <th className="px-4 py-3">Consecutive Q</th>
              <th className="px-4 py-3">Escalated</th>
              <th className="px-4 py-3">Last period</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Recommendation</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                  No funds on the watchlist. Funds appear here after an approved assessment with a watchlist-level recommendation.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.watchlist.id} className={cn('border-b border-gray-100', rowTone(r))}>
                  <td className="px-4 py-3 font-medium text-[#0B1F45]">{r.fund_name}</td>
                  <td className="px-4 py-3 text-gray-700">{r.watchlist.placed_on_watchlist}</td>
                  <td className="px-4 py-3 tabular-nums">{r.watchlist.consecutive_quarters}</td>
                  <td className="px-4 py-3">{r.watchlist.escalated ? <span className="font-medium text-red-800">Yes</span> : 'No'}</td>
                  <td className="px-4 py-3 text-gray-700">{r.last_assessment_period ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.last_weighted_total_score != null ? r.last_weighted_total_score.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-800">{r.last_category ?? '—'}</td>
                  <td className="px-4 py-3 capitalize text-gray-800">{r.last_divestment_recommendation?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/portfolio/funds/${r.watchlist.fund_id}`} className="text-sm font-medium text-[#0F8A6E] hover:underline">
                      Open fund
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
