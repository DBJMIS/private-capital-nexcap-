'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { FundPerformanceSnapshotModal } from '@/components/portfolio/FundPerformanceSnapshotModal';
import { Button } from '@/components/ui/button';
import { deleteFundSnapshotAction } from '@/app/(auth)/portfolio/funds/[id]/fund-snapshot-actions';
import {
  applyDbjNavShareForMetrics,
  formatMetricIrr,
  formatMetricRatio,
  type FundPerformanceMetrics,
  type FundPerformanceSnapshotRow,
  type MonthlyChartPoint,
} from '@/lib/portfolio/fund-performance-metrics';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import type { VcFundSnapshot } from '@/types/database';

type ApiPayload = {
  is_pvc?: boolean;
  currency?: string;
  latest_metrics?: FundPerformanceMetrics | null;
  reported_irr?: number | null;
  total_called?: number;
  total_distributed?: number;
  nav?: number | null;
  chart?: MonthlyChartPoint[];
  snapshots?: FundPerformanceSnapshotRow[];
  error?: string;
};

function fmtMoney(currency: string, n: number) {
  const cur = currency === 'JMD' ? 'JMD' : 'USD';
  return `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FundPerformanceTab({
  fund,
  canWrite,
  canDelete,
}: {
  fund: PortfolioFundRow;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editRow, setEditRow] = useState<VcFundSnapshot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/performance`);
      const j = (await res.json()) as ApiPayload;
      if (!res.ok) throw new Error(j.error ?? 'Failed to load');
      setPayload(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [fund.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!okMsg) return;
    const t = setTimeout(() => setOkMsg(null), 4000);
    return () => clearTimeout(t);
  }, [okMsg]);

  const isPvc = !!payload?.is_pvc;
  const m = payload?.latest_metrics ?? null;
  const chartData = useMemo(() => {
    const rows = payload?.chart ?? [];
    return rows.map((r) => ({
      ...r,
      callOut: r.calls > 0 ? -r.calls : 0,
      distIn: r.distributions,
    }));
  }, [payload?.chart]);

  const openAdd = () => {
    setModalMode('add');
    setEditRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: FundPerformanceSnapshotRow) => {
    setModalMode('edit');
    const { metrics: _m, ...snap } = row;
    setEditRow(snap as VcFundSnapshot);
    setModalOpen(true);
  };

  const remove = async (row: FundPerformanceSnapshotRow) => {
    if (!canDelete) return;
    if (!confirm('Delete this snapshot?')) return;
    setBusyId(row.id);
    setErr(null);
    const res = await deleteFundSnapshotAction(fund.id, row.id);
    setBusyId(null);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setOkMsg('Snapshot deleted.');
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Loading performance…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}
      {okMsg ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{okMsg}</div> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0B1F45]">Performance metrics</h2>
          <p className="text-xs text-gray-500">As of latest snapshot and cumulative calls / distributions.</p>
        </div>
        {canWrite ? (
          <Button type="button" size="sm" onClick={openAdd} className="gap-1">
            <Plus className="h-4 w-4" aria-hidden />
            Add snapshot
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'DPI', value: m?.dpi != null ? formatMetricRatio(m.dpi) : '—', hide: false },
          { label: 'RVPI', value: m?.rvpi != null ? formatMetricRatio(m.rvpi) : '—', hide: isPvc },
          { label: 'TVPI', value: m?.tvpi != null ? formatMetricRatio(m.tvpi) : '—', hide: isPvc },
          { label: 'MOIC', value: m?.moic != null ? formatMetricRatio(m.moic) : '—', hide: isPvc },
          { label: 'Calc. IRR', value: formatMetricIrr(m?.calculated_irr ?? null), hide: isPvc },
          { label: 'Reported IRR', value: formatMetricIrr(payload?.reported_irr ?? null), hide: false },
        ]
          .filter((t) => !t.hide)
          .map((t) => (
            <div key={t.label} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.label}</p>
              <p className="mt-2 text-xl font-bold text-[#0B1F45]">{t.value}</p>
            </div>
          ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Cumulative called</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {fmtMoney(fund.currency, Number(payload?.total_called ?? 0))}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Cumulative distributions</p>
          <p className="mt-1 text-lg font-semibold text-[#0F8A6E]">
            {fmtMoney(fund.currency, Number(payload?.total_distributed ?? 0))}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Latest NAV</p>
          {payload?.nav != null ? (
            <>
              <p className="mt-1 text-lg font-semibold text-gray-900">{fmtMoney(fund.currency, payload.nav)}</p>
              <p className="mt-1 text-xs text-gray-500">
                DBJ share: {fmtMoney(fund.currency, applyDbjNavShareForMetrics(Number(payload.nav), fund.dbj_pro_rata_pct ?? null))}
              </p>
            </>
          ) : (
            <p className="mt-1 text-lg font-semibold text-gray-900">—</p>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-[#0B1F45]">Cash flows &amp; NAV</h3>
        <p className="mt-1 text-xs text-gray-500">Monthly capital calls (down), distributions (up){isPvc ? '.' : ', and NAV after each snapshot.'}</p>
        <div className="mt-4 h-[280px] w-full min-w-0">
          {chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">No chart data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280} minWidth={280} minHeight={280}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
                <Tooltip
                  formatter={(value, name) => {
                    if (value === undefined || value === null) return ['—', String(name)];
                    const n = typeof value === 'number' ? value : Number(value);
                    if (name === 'NAV') return [fmtMoney(fund.currency, n), name];
                    return [fmtMoney(fund.currency, Math.abs(n)), name];
                  }}
                />
                <Legend />
                <Bar dataKey="callOut" name="Capital calls" stackId="flows" fill="#C8973A" />
                <Bar dataKey="distIn" name="Distributions" stackId="flows" fill="#0F8A6E" />
                {!isPvc ? (
                  <Area type="stepAfter" dataKey="nav" name="NAV" stroke="#0B1F45" fill="#0B1F45" fillOpacity={0.08} connectNulls />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-[#0B1F45]">Snapshot history</h3>
        </div>
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Period</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2 text-right">NAV</th>
              <th className="px-4 py-2 text-right">DPI</th>
              {!isPvc ? <th className="px-4 py-2 text-right">TVPI</th> : null}
              {!isPvc ? <th className="px-4 py-2 text-right">Calc. IRR</th> : null}
              <th className="px-4 py-2 text-right">Reported IRR</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(payload?.snapshots ?? []).length === 0 ? (
              <tr>
                <td colSpan={isPvc ? 6 : 8} className="px-4 py-8 text-center text-gray-500">
                  No snapshots yet. Add a quarterly snapshot to track NAV and performance.
                </td>
              </tr>
            ) : (
              (payload?.snapshots ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-[#F8F9FF]">
                  <td className="px-4 py-2 font-medium text-[#0B1F45]">
                    Q{r.period_quarter} {r.period_year}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{fmtDate(r.snapshot_date)}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(fund.currency, Number(r.nav))}</td>
                  <td className="px-4 py-2 text-right">{formatMetricRatio(r.metrics.dpi)}</td>
                  {!isPvc ? <td className="px-4 py-2 text-right">{formatMetricRatio(r.metrics.tvpi)}</td> : null}
                  {!isPvc ? <td className="px-4 py-2 text-right">{formatMetricIrr(r.metrics.calculated_irr)}</td> : null}
                  <td className="px-4 py-2 text-right">{formatMetricIrr(r.reported_irr != null ? Number(r.reported_irr) : null)}</td>
                  <td className="px-4 py-2 text-right">
                    {canWrite ? (
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        {canDelete ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-red-700"
                            disabled={busyId === r.id}
                            onClick={() => void remove(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <FundPerformanceSnapshotModal
        fundId={fund.id}
        mode={modalMode}
        open={modalOpen}
        initial={editRow}
        onClose={() => setModalOpen(false)}
        onSaved={(msg) => {
          setOkMsg(msg);
          void load();
        }}
      />
    </div>
  );
}
