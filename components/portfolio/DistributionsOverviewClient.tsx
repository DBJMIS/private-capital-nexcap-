'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { RETURN_TYPE_BADGES, RETURN_TYPE_LABELS, RETURN_TYPES, type ReturnType } from '@/lib/portfolio/distributions';
import { num } from '@/lib/portfolio/capital-calls';
import { cn } from '@/lib/utils';
import type { VcDistribution } from '@/types/database';

type FundSummary = {
  fund_id: string;
  fund_name: string;
  currency: string;
  total_distributions: number;
  total_amount: number;
  yield_pct: number;
  last_distribution_date: string | null;
  by_type: Record<ReturnType, number>;
};

type DistRow = VcDistribution & { fund_name: string; usd_equiv_amount: number };

type Kpi = {
  total_returned_usd_equiv: number;
  avg_yield_pct: number;
  most_active_fund: FundSummary | null;
  funds_with_no_returns_count: number;
  funds_with_no_returns: string[];
};

const SLICE_COLORS = ['#0B1F45', '#C8973A', '#0F8A6E', '#3B82F6', '#6366f1', '#14b8a6'];

function fmtUsd(n: number) {
  return `USD ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtNative(currency: string, n: number) {
  const cur = currency === 'JMD' ? 'JMD' : 'USD';
  return `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function typeBadge(rt: string) {
  const key = rt as ReturnType;
  const cls = RETURN_TYPE_BADGES[key] ?? RETURN_TYPE_BADGES.other;
  const label = RETURN_TYPE_LABELS[key] ?? rt;
  return { className: cls, label };
}

export function DistributionsOverviewClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [funds, setFunds] = useState<FundSummary[]>([]);
  const [all, setAll] = useState<DistRow[]>([]);
  const [chartByYear, setChartByYear] = useState<{ year: string; total_usd: number }[]>([]);
  const [returnsByFund, setReturnsByFund] = useState<{ fund_id: string; fund_name: string; total_usd: number }[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);

  const [fundFilter, setFundFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch('/api/portfolio/distributions/summary');
        const j = (await res.json()) as {
          funds?: FundSummary[];
          all_distributions?: DistRow[];
          chart_by_year?: { year: string; total_usd: number }[];
          returns_by_fund?: { fund_id: string; fund_name: string; total_usd: number }[];
          kpi?: Kpi;
          error?: string;
        };
        if (!res.ok) throw new Error(j.error ?? 'Failed');
        if (cancelled) return;
        setFunds(j.funds ?? []);
        setAll(j.all_distributions ?? []);
        setChartByYear(j.chart_by_year ?? []);
        setReturnsByFund(j.returns_by_fund ?? []);
        setKpi(j.kpi ?? null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const row of all) {
      ys.add(Number(row.distribution_date.slice(0, 4)));
    }
    return [...ys].sort((a, b) => b - a);
  }, [all]);

  const filteredTable = useMemo(() => {
    return all.filter((row) => {
      if (fundFilter !== 'all' && row.fund_id !== fundFilter) return false;
      if (yearFilter !== 'all' && row.distribution_date.slice(0, 4) !== yearFilter) return false;
      if (typeFilter !== 'all' && row.return_type !== typeFilter) return false;
      return true;
    });
  }, [all, fundFilter, yearFilter, typeFilter]);

  const pieData = returnsByFund.map((r, i) => ({
    name: r.fund_name,
    value: r.total_usd,
    color: SLICE_COLORS[i % SLICE_COLORS.length]!,
  }));

  const noReturnsNote =
    kpi?.funds_with_no_returns?.length && kpi.funds_with_no_returns.length > 0
      ? `Funds with no distributions: ${kpi.funds_with_no_returns.join(', ')}`
      : 'Funds with no distributions: JASMEF 1, NCBCM Stratus, Portland JSX, MPC CCEF, SEAF, Caribbean VC';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div>
        <h1 className="text-2xl font-bold text-[#0B1F45]">Distributions & Dividends</h1>
        <p className="mt-1 text-sm text-gray-400">Cash returns to DBJ from active fund portfolio</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0F8A6E] bg-white p-5">
          <p className="text-2xl font-bold text-[#0B1F45]">{fmtUsd(kpi?.total_returned_usd_equiv ?? 0)}</p>
          <p className="mt-1 text-sm text-gray-600">Total Returned (USD)</p>
          <p className="mt-2 text-xs text-gray-400">Across all funds</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#C8973A] bg-white p-5">
          <p className="text-2xl font-bold text-[#0B1F45]">{(kpi?.avg_yield_pct ?? 0).toFixed(1)}%</p>
          <p className="mt-1 text-sm text-gray-600">Avg Yield</p>
          <p className="mt-2 text-xs text-gray-400">On DBJ committed capital</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-blue-500 bg-white p-5">
          <p className="text-lg font-bold leading-snug text-[#0B1F45]">{kpi?.most_active_fund?.fund_name ?? '—'}</p>
          <p className="mt-1 text-sm text-gray-600">Most Distributions</p>
          <p className="mt-2 text-xs text-gray-400">
            {kpi?.most_active_fund ? `${kpi.most_active_fund.total_distributions} distributions paid` : 'No data'}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-gray-400 bg-white p-5">
          <p className="text-2xl font-bold text-[#0B1F45]">{kpi?.funds_with_no_returns_count ?? 0}</p>
          <p className="mt-1 text-sm text-gray-600">No Returns Yet</p>
          <p className="mt-2 text-xs text-gray-400">JASMEF, Stratus, others</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-[#0B1F45]">Distribution History</h2>
          <p className="text-xs text-gray-400">All funds — by year (USD equivalent @ 157 JMD/USD)</p>
          <div className="mt-4 h-[280px]">
            {chartByYear.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-500">No distributions yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartByYear}>
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v))
                    }
                  />
                  <Tooltip
                    formatter={(v) =>
                      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                        Number(v ?? 0),
                      )
                    }
                    labelFormatter={(l) => `Year ${l}`}
                  />
                  <Bar dataKey="total_usd" fill="#0F8A6E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#0B1F45]">Returns by Fund</h2>
          <p className="text-xs text-gray-400">USD equivalent</p>
          <div className="relative mt-4 h-[280px]">
            {pieData.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-500">No returns yet.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={1}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) =>
                        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                          Number(v ?? 0),
                        )
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="text-sm font-medium text-gray-600">{pieData.length} funds</p>
                </div>
              </>
            )}
          </div>
          <ul className="mt-4 space-y-2">
            {pieData.map((p) => (
              <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="truncate text-[#0B1F45]">{p.name}</span>
                </span>
                <span className="shrink-0 font-semibold text-[#0B1F45]">{fmtUsd(p.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-5 py-4 text-base font-semibold text-[#0B1F45]">All Distributions</h2>
        <div className="flex flex-wrap gap-3 border-b border-gray-100 px-5 py-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Fund</label>
            <select
              className="mt-1 flex h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={fundFilter}
              onChange={(e) => setFundFilter(e.target.value)}
            >
              <option value="all">All funds</option>
              {funds.map((f) => (
                <option key={f.fund_id} value={f.fund_id}>
                  {f.fund_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Year</label>
            <select
              className="mt-1 flex h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Type</label>
            <select
              className="mt-1 flex h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              {RETURN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RETURN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-100 bg-white text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">Fund</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Cumulative</th>
                <th className="px-5 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTable.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                    No rows for this filter.
                  </td>
                </tr>
              ) : (
                filteredTable.map((row) => {
                  const tb = typeBadge(row.return_type);
                  return (
                    <tr key={row.id}>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[#0B1F45]">{row.fund_name}</span>
                          <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{row.currency}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{fmtDate(row.distribution_date)}</td>
                      <td className="px-5 py-3 text-gray-800">{row.distribution_number}</td>
                      <td className="px-5 py-3">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', tb.className)}>{tb.label}</span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-[#0F8A6E]">{fmtNative(row.currency, num(row.amount))}</td>
                      <td className="px-5 py-3 text-sm text-gray-400">
                        {row.cumulative_total != null ? fmtNative(row.currency, num(row.cumulative_total)) : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-400">{row.source_company?.trim() ? row.source_company : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 pt-2 text-xs italic text-gray-400">{noReturnsNote}</p>
      </div>
    </div>
  );
}
