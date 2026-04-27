'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DivestmentSummaryRow } from '@/lib/portfolio/types';

type TriggerFilter = 'all' | 'hold' | 'monitor' | 'watchlist' | 'divest' | 'freeze';

function stageLabel(stage: DivestmentSummaryRow['investment_stage']) {
  if (stage === 'fully_invested') return 'Fully invested';
  if (stage === 'partially_invested') return 'Partially invested';
  if (stage === 'not_yet_deployed') return 'Not yet deployed';
  return '—';
}

function recKey(rec: string | null): TriggerFilter {
  if (!rec) return 'all';
  if (rec === 'hold') return 'hold';
  if (rec === 'monitor') return 'monitor';
  if (rec === 'watchlist') return 'watchlist';
  if (rec === 'divest') return 'divest';
  if (rec.includes('freeze')) return 'freeze';
  return 'all';
}

function triggerLabel(rec: string | null) {
  if (!rec) return '—';
  if (rec === 'divest') return 'Divest';
  if (rec.includes('freeze')) return 'Freeze further commitments and divest once possible';
  if (rec === 'monitor') return 'Monitor';
  if (rec === 'hold') return 'Hold';
  if (rec === 'watchlist') return 'Watchlist';
  return rec.replace(/_/g, ' ');
}

function triggerClass(rec: string | null) {
  if (rec === 'divest') return 'font-semibold text-red-700';
  if (rec?.includes('freeze')) return 'font-semibold text-red-700';
  if (rec === 'monitor') return 'text-amber-700';
  if (rec === 'hold') return 'text-gray-700';
  return 'text-gray-600';
}

function flagCell(score: number | null) {
  if (score == null) return <span className="text-gray-300">—</span>;
  if (score < 50) {
    return <span className="inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">X</span>;
  }
  if (score < 70) return <span className="text-xs font-medium text-amber-700">Further monitoring...</span>;
  return null;
}

function ddFlagCell(row: DivestmentSummaryRow) {
  const rec = (row.dd_outcome_at_commitment ?? row.dd_reference?.recommendation ?? '').toLowerCase();
  const underperforming = (row.financial_performance_score ?? 100) < 50 || (row.development_impact_score ?? 100) < 50;
  if (rec === 'approve_with_conditions') {
    return <span className="text-xs font-medium text-amber-700">Further monitoring...</span>;
  }
  if (rec === 'approve' && underperforming) {
    return <span className="inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">X</span>;
  }
  return null;
}

function obligationFlag(v: boolean) {
  if (!v) return null;
  return <span className="inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">X</span>;
}

function toCsv(rows: DivestmentSummaryRow[]) {
  const headers = [
    'Name of Fund',
    'Year Invested',
    'Stage',
    'Financial Performance',
    'Impact',
    'Due Diligence Outcome',
    'Obligation for Continued Support',
    'Performance Trigger',
  ];
  const body = rows.map((r) => [
    r.fund_name,
    r.commitment_year ?? '',
    stageLabel(r.investment_stage),
    (r.financial_performance_score ?? '').toString(),
    (r.development_impact_score ?? '').toString(),
    r.dd_outcome_at_commitment ?? r.dd_reference?.recommendation ?? '',
    r.contractual_obligation ? 'X' : '',
    triggerLabel(r.divestment_recommendation),
  ]);
  const all = [headers, ...body].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  return all;
}

export function DivestmentSummaryClient({ rows, asAt }: { rows: DivestmentSummaryRow[]; asAt: string }) {
  const [trigger, setTrigger] = useState<TriggerFilter>('all');
  const [currency, setCurrency] = useState<'all' | string>('all');
  const [category, setCategory] = useState<'all' | string>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const currencies = useMemo(() => ['all', ...Array.from(new Set(rows.map((r) => r.currency))).sort()], [rows]);
  const categories = useMemo(() => ['all', ...Array.from(new Set(rows.map((r) => r.fund_category ?? 'Unspecified'))).sort()], [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (trigger !== 'all' && recKey(r.divestment_recommendation) !== trigger) return false;
      if (currency !== 'all' && r.currency !== currency) return false;
      const c = r.fund_category ?? 'Unspecified';
      if (category !== 'all' && c !== category) return false;
      return true;
    });
  }, [rows, trigger, currency, category]);

  const active = filtered.find((r) => r.assessment_id === openId) ?? null;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .divestment-filters { display: none !important; }
              .divestment-actions { display: none !important; }
              .divestment-row { pointer-events: none !important; }
              .divestment-slide { display: none !important; }
            }
          `,
        }}
      />
      <div className="space-y-4">
        <header className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#0B1F45]">Divestment Assessment Summary</h1>
              <p className="text-sm text-gray-500">as at {asAt}</p>
            </div>
            <div className="divestment-actions flex items-center gap-2 print:hidden">
              <Button type="button" variant="outline" onClick={() => window.print()}>
                Print
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'divestment-assessment-summary.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export
              </Button>
            </div>
          </div>
        </header>

        <div className="divestment-filters flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 print:hidden">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All' },
              { key: 'hold', label: 'Hold' },
              { key: 'monitor', label: 'Monitor' },
              { key: 'watchlist', label: 'Watchlist' },
              { key: 'divest', label: 'Divest' },
              { key: 'freeze', label: 'Freeze' },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setTrigger(f.key as TriggerFilter)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs',
                  trigger === f.key ? 'border-[#0B1F45] bg-[#EEF1F8] text-[#0B1F45]' : 'border-gray-200 text-gray-600',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select className="h-8 rounded border border-gray-300 px-2 text-xs" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All currencies' : c}
              </option>
            ))}
          </select>
          <select className="h-8 rounded border border-gray-300 px-2 text-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#0B1F45] text-left text-white">
              <tr>
                {[
                  'Name of Fund',
                  'Year Invested',
                  'Stage',
                  'Financial Performance',
                  'Impact',
                  'Due Diligence Outcome',
                  'Obligation for Continued Support',
                  'Performance Trigger',
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white/80">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                    No approved quarterly assessments available yet. Complete and approve assessments for at least one fund to populate this view.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.assessment_id}
                    className="divestment-row cursor-pointer hover:bg-gray-50 print:cursor-default print:hover:bg-transparent"
                    onClick={() => setOpenId(r.assessment_id)}
                  >
                    <td className="px-3 py-2 font-medium text-[#0B1F45]">{r.fund_name}</td>
                    <td className="px-3 py-2">{r.commitment_year ?? '—'}</td>
                    <td className="px-3 py-2">{stageLabel(r.investment_stage)}</td>
                    <td className="px-3 py-2">{flagCell(r.financial_performance_score)}</td>
                    <td className="px-3 py-2">{flagCell(r.development_impact_score)}</td>
                    <td className="px-3 py-2">{ddFlagCell(r)}</td>
                    <td className="px-3 py-2">{obligationFlag(r.contractual_obligation)}</td>
                    <td className={cn('px-3 py-2', triggerClass(r.divestment_recommendation))}>{triggerLabel(r.divestment_recommendation)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {active ? (
        <div className="divestment-slide fixed inset-0 z-50 bg-black/30 print:hidden" onClick={() => setOpenId(null)}>
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-[#0B1F45]">{active.fund_name}</h2>
              <button type="button" className="text-sm text-gray-500 hover:text-gray-800" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {active.assessment_period} · {active.assessment_date}
            </p>
            <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 p-3 text-sm sm:grid-cols-2">
              <p>Financial: {active.financial_performance_score ?? '—'}</p>
              <p>Impact: {active.development_impact_score ?? '—'}</p>
              <p>Weighted score: {active.weighted_total_score ?? '—'}</p>
              <p>Lifecycle: {active.fund_lifecycle_stage}</p>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-[#0B1F45]">AI summary</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{active.ai_summary?.trim() ? active.ai_summary : '—'}</p>
            </div>
            <div className="mt-6">
              <Link href={`/portfolio/funds/${active.fund_id}/assessments/${active.assessment_id}`} className="text-sm font-medium text-[#0F8A6E] underline">
                Open full assessment review
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
