'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VcQuarterlyAssessment } from '@/types/database';

type Enriched = VcQuarterlyAssessment & {
  assessed_by_name?: string | null;
  approved_by_name?: string | null;
};

function statusClass(s: string) {
  const x = s.toLowerCase();
  if (x === 'approved') return 'bg-emerald-50 text-emerald-900 border border-emerald-200';
  if (x === 'submitted') return 'bg-amber-50 text-amber-900 border border-amber-200';
  if (x === 'draft') return 'bg-gray-100 text-gray-700 border border-gray-200';
  return 'bg-[#EEF3FB] text-gray-700 border border-[#D0DBED]';
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const pts = useMemo(() => {
    const pairs: { x: number; y: number }[] = [];
    const n = values.length;
    if (n === 0) return null;
    values.forEach((v, i) => {
      if (v == null || Number.isNaN(v)) return;
      const x = n > 1 ? (i / (n - 1)) * 80 : 40;
      pairs.push({ x, y: v });
    });
    if (pairs.length === 0) return null;
    const ys = pairs.map((p) => p.y);
    const min = Math.min(...ys, 0);
    const max = Math.max(...ys, 100);
    const span = Math.max(max - min, 1);
    const h = 24;
    const d = pairs
      .map((p, i) => {
        const py = h - ((p.y - min) / span) * (h - 4) - 2;
        return `${i === 0 ? 'M' : 'L'} ${p.x},${py}`;
      })
      .join(' ');
    return { d, w: 80, h };
  }, [values]);

  if (!pts) return <span className="text-xs text-gray-400">—</span>;

  return (
    <svg width={pts.w} height={pts.h} className="overflow-visible" aria-hidden>
      <path d={pts.d} fill="none" stroke="#0B1F45" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function FundAssessmentsTab({ fundId, canWrite }: { fundId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/portfolio/funds/${fundId}/assessments`);
    const j = (await res.json()) as { assessments?: Enriched[]; error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load assessments');
      setRows([]);
    } else {
      setRows(j.assessments ?? []);
    }
    setLoading(false);
  }, [fundId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedAsc = useMemo(
    () => [...rows].sort((a, b) => (a.assessment_date < b.assessment_date ? -1 : 1)),
    [rows],
  );
  const sparkValues = useMemo(
    () => sortedAsc.map((r) => (r.weighted_total_score != null ? Number(r.weighted_total_score) : null)),
    [sortedAsc],
  );

  const sortedDesc = useMemo(
    () => [...rows].sort((a, b) => (a.assessment_date < b.assessment_date ? 1 : -1)),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0B1F45]">Quarterly assessments</h2>
          <p className="mt-1 text-sm text-gray-500">History, scores, and committee workflow status.</p>
        </div>
        {canWrite ? (
          <Button asChild className="bg-[#0F8A6E] hover:bg-[#0c6f58]">
            <Link href={`/portfolio/funds/${fundId}/assessments/new`}>New assessment</Link>
          </Button>
        ) : null}
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase text-gray-400">Score trend (chronological)</p>
        <div className="mt-2 flex items-center gap-3">
          <Sparkline values={sparkValues} />
          <span className="text-xs text-gray-500">{sparkValues.filter((v) => v != null).length} data points</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Weighted</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Recommendation</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : sortedDesc.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No assessments yet.
                  {canWrite ? (
                    <>
                      {' '}
                      <Link href={`/portfolio/funds/${fundId}/assessments/new`} className="font-medium text-[#0F8A6E] underline">
                        Create the first one
                      </Link>
                      .
                    </>
                  ) : null}
                </td>
              </tr>
            ) : (
              sortedDesc.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="px-4 py-3 font-medium text-[#0B1F45]">{r.assessment_period}</td>
                  <td className="px-4 py-3 text-gray-600">{r.assessment_date}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize', statusClass(r.status))}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.weighted_total_score != null ? Number(r.weighted_total_score).toFixed(1) : '—'}</td>
                  <td className="px-4 py-3 capitalize text-gray-700">{r.category ?? '—'}</td>
                  <td className="px-4 py-3 capitalize text-gray-700">{r.divestment_recommendation?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/portfolio/funds/${fundId}/assessments/${r.id}`} className="text-sm font-medium text-[#0F8A6E] hover:underline">
                        View assessment
                      </Link>
                      {r.status === 'approved' ? (
                        <a
                          href={`/api/portfolio/funds/${fundId}/assessments/${r.id}/pctu-report`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Download PCTU Report"
                          className="inline-flex text-[#0B1F45] hover:text-[#0F8A6E]"
                          aria-label="Download PCTU Report"
                        >
                          <Download className="h-4 w-4" aria-hidden />
                        </a>
                      ) : null}
                    </div>
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
