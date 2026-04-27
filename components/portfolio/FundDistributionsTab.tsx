'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, MoreHorizontal, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RETURN_TYPE_BADGES, RETURN_TYPE_LABELS, RETURN_TYPES, type ReturnType } from '@/lib/portfolio/distributions';
import { num } from '@/lib/portfolio/capital-calls';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';
import type { VcDistribution } from '@/types/database';

type ApiSummary = {
  total_distributions: number;
  total_amount: number;
  currency: string;
  by_type: Record<ReturnType, number>;
  yield_pct: number;
};

function fmtMoney(currency: string, n: number) {
  const cur = currency === 'JMD' ? 'JMD' : 'USD';
  return `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(ymd: string | null) {
  if (!ymd) return '—';
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function typeBadge(rt: string) {
  const key = rt as ReturnType;
  const cls = RETURN_TYPE_BADGES[key] ?? RETURN_TYPE_BADGES.other;
  const label = RETURN_TYPE_LABELS[key] ?? rt;
  return { className: cls, label };
}

export function FundDistributionsTab({ fund, canWrite }: { fund: PortfolioFundRow; canWrite: boolean }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<VcDistribution[]>([]);
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<VcDistribution | null>(null);

  const [distNo, setDistNo] = useState(1);
  const [distDate, setDistDate] = useState('');
  const [returnType, setReturnType] = useState<ReturnType>('dividend');
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState('');
  const [perUnit, setPerUnit] = useState('');
  const [source, setSource] = useState('');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions`);
      const j = (await res.json()) as {
        distributions?: VcDistribution[];
        summary?: ApiSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? 'Failed to load');
      setRows(j.distributions ?? []);
      setSummary(j.summary ?? null);
      const maxN = Math.max(0, ...(j.distributions ?? []).map((d) => d.distribution_number));
      setDistNo(maxN + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [fund.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dbj = num(fund.dbj_commitment);
  const yieldPct = summary?.yield_pct ?? 0;

  const latest = useMemo(() => {
    if (rows.length === 0) return null;
    return [...rows].sort((a, b) => (a.distribution_date < b.distribution_date ? 1 : -1))[0]!;
  }, [rows]);

  const dividendTotal = summary?.by_type.dividend ?? 0;
  const capGainTotal = summary?.by_type.capital_gain ?? 0;

  const amtNum = Number(amount) || 0;
  const unitsNum = Number(units) || 0;
  const perNum = Number(perUnit) || 0;
  const unitMatch =
    fund.listed && unitsNum > 0 && perNum > 0 && amtNum > 0 && Math.abs(unitsNum * perNum - amtNum) <= Math.max(0.01, amtNum * 0.0001);

  const resetForm = () => {
    setDistDate('');
    setReturnType('dividend');
    setAmount('');
    setUnits('');
    setPerUnit('');
    setSource('');
    setRefNo('');
    setNotes('');
  };

  const openAdd = () => {
    const maxN = Math.max(0, ...rows.map((d) => d.distribution_number));
    setDistNo(maxN + 1);
    resetForm();
    setAddOpen(true);
  };

  const openEdit = (d: VcDistribution) => {
    setEditOpen(d);
    setDistNo(d.distribution_number);
    setDistDate(d.distribution_date);
    setReturnType(d.return_type as ReturnType);
    setAmount(String(d.amount));
    setUnits(d.units != null ? String(d.units) : '');
    setPerUnit(d.per_unit_amount != null ? String(d.per_unit_amount) : '');
    setSource(d.source_company ?? '');
    setRefNo(d.reference_number ?? '');
    setNotes(d.notes ?? '');
  };

  const saveNew = async () => {
    if (!distDate.trim() || amtNum <= 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribution_number: distNo,
          distribution_date: distDate.trim(),
          return_type: returnType,
          amount: amtNum,
          currency: fund.currency,
          units: units.trim() ? unitsNum : null,
          per_unit_amount: perUnit.trim() ? perNum : null,
          source_company: source.trim() || null,
          notes: notes.trim() || null,
          reference_number: refNo.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setAddOpen(false);
      resetForm();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editOpen || !distDate.trim() || amtNum <= 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions/${editOpen.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribution_number: distNo,
          distribution_date: distDate.trim(),
          return_type: returnType,
          amount: amtNum,
          currency: fund.currency,
          units: units.trim() ? unitsNum : null,
          per_unit_amount: perUnit.trim() ? perNum : null,
          source_company: source.trim() || null,
          notes: notes.trim() || null,
          reference_number: refNo.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setEditOpen(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteRow = async (d: VcDistribution) => {
    if (!confirm('Delete this distribution?')) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions/${d.id}`, { method: 'DELETE' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const formDialog = (mode: 'add' | 'edit') => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) {
          if (mode === 'add') setAddOpen(false);
          else setEditOpen(null);
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold text-[#0B1F45]">{mode === 'add' ? 'New Distribution' : 'Edit Distribution'}</h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Distribution Number</Label>
            <Input type="number" className="mt-1" value={distNo} onChange={(e) => setDistNo(Number(e.target.value))} min={1} />
          </div>
          <div>
            <Label>Distribution Date</Label>
            <Input type="date" className="mt-1" value={distDate} onChange={(e) => setDistDate(e.target.value)} required />
          </div>
        </div>

        <div className="mt-6">
          <Label>Return Type</Label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {RETURN_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setReturnType(t)}
                className={cn(
                  'rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors',
                  returnType === t ? 'border-2 border-[#0B1F45] bg-[#0B1F45]/5 text-[#0B1F45]' : 'border border-gray-200 text-gray-700 hover:bg-gray-50',
                )}
              >
                {RETURN_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Amount</Label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">{fund.currency}</span>
              <Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-[#0B1F45]">
              Currency: {fund.currency}
            </span>
            {unitMatch ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-[#0F8A6E]">
                <Check className="h-4 w-4" aria-hidden />
                Units x per unit matches amount
              </span>
            ) : null}
          </div>
        </div>

        {fund.listed ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Units (optional)</Label>
              <Input type="number" step="any" className="mt-1" value={units} onChange={(e) => setUnits(e.target.value)} />
            </div>
            <div>
              <Label>Per Unit Amount (optional)</Label>
              <Input type="number" step="any" className="mt-1" value={perUnit} onChange={(e) => setPerUnit(e.target.value)} />
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <Label>Source Company (optional)</Label>
          <Input className="mt-1" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <div className="mt-4">
          <Label>Reference Number (optional)</Label>
          <Input className="mt-1" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
        </div>
        <div className="mt-4">
          <Label>Notes (optional)</Label>
          <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (mode === 'add') setAddOpen(false);
              else setEditOpen(null);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#0B1F45] hover:bg-[#162d5e]"
            disabled={busy || !distDate || amtNum <= 0}
            onClick={() => void (mode === 'add' ? saveNew() : saveEdit())}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Distribution
          </Button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden />
        Loading distributions…
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      {summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0F8A6E] bg-white p-5">
              <p className="text-2xl font-bold text-[#0B1F45]">{fmtMoney(summary.currency, summary.total_amount)}</p>
              <p className="mt-1 text-sm text-gray-600">Total Received</p>
              <p className="mt-2 text-xs text-gray-400">{summary.total_distributions} distributions to date</p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#C8973A] bg-white p-5">
              <p className="text-2xl font-bold text-[#0B1F45]">{yieldPct.toFixed(1)}%</p>
              <p className="mt-1 text-sm text-gray-600">Yield on Commitment</p>
              <p className="mt-2 text-xs text-gray-400">Return on DBJ investment</p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-blue-500 bg-white p-5">
              <p className="text-2xl font-bold text-[#0B1F45]">
                {latest ? fmtMoney(latest.currency, num(latest.amount)) : '—'}
              </p>
              <p className="mt-1 text-sm text-gray-600">Latest Distribution</p>
              <p className="mt-2 text-xs text-gray-400">{latest ? fmtDate(latest.distribution_date) : 'No distributions yet'}</p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-purple-500 bg-white p-5">
              <p className="text-sm font-medium text-gray-600">By Return Type</p>
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  <span className="text-gray-500">Dividends:</span>{' '}
                  <span className="font-semibold text-[#0B1F45]">{fmtMoney(summary.currency, dividendTotal)}</span>
                </p>
                <p>
                  <span className="text-gray-500">Capital Gains:</span>{' '}
                  <span className="font-semibold text-[#0B1F45]">{fmtMoney(summary.currency, capGainTotal)}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-[#0B1F45]">Yield on Commitment</p>
              <p className="text-sm text-gray-500">{yieldPct.toFixed(1)}% of committed capital returned</p>
            </div>
            <div className="mt-2 h-3 w-full rounded-full bg-gray-100">
              <div className="h-3 rounded-full bg-[#0F8A6E] transition-all" style={{ width: `${Math.min(100, yieldPct)}%` }} />
            </div>
          </div>
        </>
      ) : null}

      <div className="flex justify-end">
        {canWrite ? (
          <Button type="button" className="bg-[#0B1F45] hover:bg-[#162d5e]" onClick={() => openAdd()}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Add Distribution
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-white text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Cumulative</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                  No distributions recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((d) => {
                const tb = typeBadge(d.return_type);
                return (
                  <tr key={d.id} className="bg-white">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-[#0B1F45]">Distribution {d.distribution_number}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtDate(d.distribution_date)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', tb.className)}>{tb.label}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#0F8A6E]">{fmtMoney(d.currency, num(d.amount))}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {d.cumulative_total != null ? fmtMoney(d.currency, num(d.cumulative_total)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{d.source_company?.trim() ? d.source_company : '—'}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-gray-400">{d.notes?.trim() ? d.notes : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {canWrite ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" type="button" className="h-8 w-8" aria-label="More">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(d)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void deleteRow(d)}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {addOpen ? formDialog('add') : null}
      {editOpen ? formDialog('edit') : null}
    </div>
  );
}
