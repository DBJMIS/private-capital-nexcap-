'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal, Plus } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PURPOSE_CATEGORY_LABELS, num } from '@/lib/portfolio/capital-calls';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';
import type { VcCapitalCall, VcCapitalCallItem } from '@/types/database';

type CallWithItems = VcCapitalCall & { items: VcCapitalCallItem[] };

type ApiSummary = {
  total_calls: number;
  total_called: number;
  total_paid: number;
  remaining_commitment: number;
  pct_deployed: number;
  fees_total: number;
  investments_total: number;
  currency: string;
};

const PURPOSES = [
  'management_fee',
  'organisation_expenses',
  'administration_fee',
  'legal_fees',
  'director_fees',
  'regulatory_expenses',
  'other_fees',
  'investment',
] as const;

function fmtMoney(currency: string, n: number) {
  const cur = currency === 'JMD' ? 'JMD' : 'USD';
  return `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(ymd: string | null) {
  if (!ymd) return '—';
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(st: string) {
  const s = st.toLowerCase();
  const map: Record<string, { className: string; label: string }> = {
    paid: { className: 'bg-teal-50 text-teal-700', label: 'Paid' },
    unpaid: { className: 'bg-amber-50 text-amber-700', label: 'Unpaid' },
    overdue: { className: 'bg-red-50 text-red-700', label: 'Overdue' },
    partial: { className: 'bg-blue-50 text-blue-700', label: 'Partial' },
    cancelled: { className: 'bg-gray-100 text-gray-500', label: 'Cancelled' },
  };
  return map[s] ?? { className: 'bg-gray-100 text-gray-600', label: st };
}

type LineDraft = {
  purpose_category: (typeof PURPOSES)[number];
  investee_company: string;
  description: string;
  amount: string;
  sort_order: number;
};

export function FundCapitalCallsTab({ fund, canWrite }: { fund: PortfolioFundRow; canWrite: boolean }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallWithItems[]>([]);
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<CallWithItems | null>(null);
  const [editOpen, setEditOpen] = useState<CallWithItems | null>(null);
  const [busy, setBusy] = useState(false);

  const [payDate, setPayDate] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const [editDue, setEditDue] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [noticeNo, setNoticeNo] = useState(1);
  const [dateNotice, setDateNotice] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([
    { purpose_category: 'management_fee', investee_company: '', description: '', amount: '', sort_order: 0 },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/capital-calls`);
      const j = (await res.json()) as {
        calls?: CallWithItems[];
        summary?: ApiSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? 'Failed to load');
      setCalls(j.calls ?? []);
      setSummary(j.summary ?? null);
      const maxN = Math.max(0, ...(j.calls ?? []).map((c) => c.notice_number));
      setNoticeNo(maxN + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [fund.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const lineSum = useMemo(() => {
    return lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  }, [lines]);

  const dbj = num(fund.dbj_commitment);
  const pct = summary?.pct_deployed ?? 0;
  const barColor = pct >= 80 ? 'bg-[#0F8A6E]' : pct >= 50 ? 'bg-amber-500' : 'bg-[#0B1F45]';

  const unpaidCount = useMemo(
    () => calls.filter((c) => ['unpaid', 'overdue', 'partial'].includes(c.status)).length,
    [calls],
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const savePaid = async () => {
    if (!payOpen || !payDate.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/capital-calls/${payOpen.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_paid: payDate.trim(), notes: payNotes.trim() || null }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setPayOpen(null);
      setPayDate('');
      setPayNotes('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editOpen) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/capital-calls/${editOpen.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          due_date: editDue.trim() || null,
          notes: editNotes.trim() || null,
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

  const deleteCall = async (c: CallWithItems) => {
    if (c.status !== 'unpaid') return;
    if (!confirm('Delete this capital call?')) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/capital-calls/${c.id}`, { method: 'DELETE' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const saveNewCall = async () => {
    if (lines.length === 0 || lineSum <= 0) return;
    for (const l of lines) {
      if (l.purpose_category === 'investment' && !l.investee_company.trim()) {
        setErr('Company name required for investment lines');
        return;
      }
    }
    setBusy(true);
    setErr(null);
    try {
      const items = lines.map((l, i) => ({
        purpose_category: l.purpose_category,
        investee_company: l.purpose_category === 'investment' ? l.investee_company.trim() : null,
        description: l.description.trim() || null,
        amount: Number(l.amount),
        sort_order: i,
      }));
      const res = await fetch(`/api/portfolio/funds/${fund.id}/capital-calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notice_number: noticeNo,
          date_of_notice: dateNotice,
          due_date: dueDate || null,
          notes: callNotes.trim() || null,
          items,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setAddOpen(false);
      setDateNotice('');
      setDueDate('');
      setCallNotes('');
      setLines([{ purpose_category: 'management_fee', investee_company: '', description: '', amount: '', sort_order: 0 }]);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const todayUnpaidDue = (due: string | null, status: string) => {
    if (!due || status === 'paid' || status === 'cancelled') return false;
    const d = new Date(`${due}T12:00:00`);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return d < t;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden />
        Loading capital calls…
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      {summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0B1F45] bg-white p-5">
              <p className="text-2xl font-bold text-[#0B1F45]">{fmtMoney(summary.currency, summary.total_called)}</p>
              <p className="mt-1 text-sm text-gray-600">Total Called</p>
              <p className="mt-2 text-xs text-gray-400">of {fmtMoney(fund.currency, dbj)} committed</p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-amber-500 bg-white p-5">
              <p className="text-2xl font-bold text-[#0B1F45]">{fmtMoney(summary.currency, summary.remaining_commitment)}</p>
              <p className="mt-1 text-sm text-gray-600">Remaining</p>
              <p className="mt-2 text-xs text-amber-700">{summary.pct_deployed}% deployed</p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-blue-500 bg-white p-5">
              <p className="text-sm font-medium text-gray-500">Call Breakdown</p>
              <div className="mt-3 flex gap-6">
                <div>
                  <p className="text-xs text-gray-400">Fees</p>
                  <p className="text-lg font-semibold text-[#0B1F45]">{fmtMoney(summary.currency, summary.fees_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Investments</p>
                  <p className="text-lg font-semibold text-[#0B1F45]">{fmtMoney(summary.currency, summary.investments_total)}</p>
                </div>
              </div>
            </div>
            <div
              className={cn(
                'relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5',
                unpaidCount > 0 ? 'border-t-4 border-t-red-500' : 'border-t-4 border-t-gray-300',
              )}
            >
              <p className="text-2xl font-bold text-[#0B1F45]">{unpaidCount}</p>
              <p className="mt-1 text-sm text-gray-600">Unpaid Calls</p>
              {unpaidCount === 0 ? (
                <p className="mt-2 text-xs font-medium text-[#0F8A6E]">All settled</p>
              ) : (
                <p className="mt-2 text-xs text-gray-400">Requires action</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-[#0B1F45]">Commitment Deployed</p>
              <p className="text-sm text-gray-500">
                {summary.pct_deployed}% of {fmtMoney(fund.currency, dbj)}
              </p>
            </div>
            <div className="mt-2 h-3 w-full rounded-full bg-gray-100">
              <div className={cn('h-3 rounded-full transition-all', barColor)} style={{ width: `${Math.min(100, summary.pct_deployed)}%` }} />
            </div>
          </div>
        </>
      ) : null}

      <div className="flex justify-end">
        {canWrite ? (
          <Button type="button" className="bg-[#0B1F45] hover:bg-[#162d5e]" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Add Capital Call
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-white text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Notice #</th>
              <th className="px-4 py-3">Date of Notice</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Date Paid</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {calls.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  No capital calls recorded yet.
                </td>
              </tr>
            ) : (
              calls.map((c) => {
                const sb = statusBadge(c.status);
                const isOpen = expanded.has(c.id);
                return (
                  <Fragment key={c.id}>
                    <tr className="bg-white">
                      <td className="px-4 py-3">
                        <button type="button" className="text-left" onClick={() => toggleExpand(c.id)}>
                          <p className="font-semibold text-[#0B1F45]">Notice {c.notice_number}</p>
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {c.items.length} line item{c.items.length === 1 ? '' : 's'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fmtDate(c.date_of_notice)}</td>
                      <td
                        className={cn(
                          'px-4 py-3',
                          todayUnpaidDue(c.due_date, c.status) ? 'font-medium text-red-600' : 'text-gray-600',
                        )}
                      >
                        {c.due_date ? fmtDate(c.due_date) : '—'}
                      </td>
                      <td className="px-4 py-3">{c.date_paid ? <span className="font-medium text-[#0F8A6E]">{fmtDate(c.date_paid)}</span> : <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 font-semibold text-[#0B1F45]">{fmtMoney(c.currency, num(c.call_amount))}</td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', sb.className)}>{sb.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canWrite && (c.status === 'unpaid' || c.status === 'overdue' || c.status === 'partial') ? (
                            <Button size="sm" type="button" className="bg-[#0B1F45] hover:bg-[#162d5e]" onClick={() => setPayOpen(c)}>
                              Mark as Paid
                            </Button>
                          ) : null}
                          {c.status === 'paid' ? (
                            <Button size="sm" variant="outline" type="button" onClick={() => toggleExpand(c.id)}>
                              View
                            </Button>
                          ) : null}
                          {canWrite ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" type="button" className="h-8 w-8" aria-label="More">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditDue(c.due_date ?? '');
                                    setEditNotes(c.notes ?? '');
                                    setEditOpen(c);
                                  }}
                                >
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={c.status !== 'unpaid'} onClick={() => void deleteCall(c)}>
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="border-t border-gray-100 px-4 py-3">
                          <table className="ml-4 min-w-[520px] text-xs">
                            <thead>
                              <tr className="text-left text-gray-500">
                                <th className="py-2 pr-4">Category</th>
                                <th className="py-2 pr-4">Description</th>
                                <th className="py-2 pr-4">Company</th>
                                <th className="py-2">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.items.map((it) => (
                                <tr key={it.id}>
                                  <td className="py-1.5 pr-4">
                                    {it.purpose_category === 'investment' ? (
                                      <span className="inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-teal-800">
                                        {PURPOSE_CATEGORY_LABELS[it.purpose_category] ?? it.purpose_category}
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                                        {PURPOSE_CATEGORY_LABELS[it.purpose_category] ?? it.purpose_category}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-4 text-gray-700">{it.description ?? '—'}</td>
                                  <td className="py-1.5 pr-4">{it.investee_company ?? '—'}</td>
                                  <td className="py-1.5 font-semibold text-[#0B1F45]">{fmtMoney(it.currency, num(it.amount))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setAddOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
            <h2 className="text-lg font-semibold text-[#0B1F45]">New Capital Call</h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Notice Number</Label>
                <Input type="number" className="mt-1" value={noticeNo} onChange={(e) => setNoticeNo(Number(e.target.value))} min={1} />
              </div>
              <div>
                <Label>Date of Notice</Label>
                <Input type="date" className="mt-1" value={dateNotice} onChange={(e) => setDateNotice(e.target.value)} required />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" className="mt-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <Label>Currency</Label>
                <p className="mt-2 inline-flex rounded-full border border-gray-200 px-3 py-1 text-sm font-medium">{fund.currency}</p>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-sm font-semibold text-[#0B1F45]">Call Breakdown</h3>
              <p className="mt-1 text-xs text-gray-500">Add each purpose separately. Total must match call amount.</p>
              <div className="mt-4 space-y-3">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid gap-2 rounded-lg border border-dashed border-gray-200 p-3 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <Label className="text-xs">Purpose</Label>
                      <Select
                        value={line.purpose_category}
                        onValueChange={(v) => {
                          const next = [...lines];
                          next[idx] = { ...next[idx]!, purpose_category: v as (typeof PURPOSES)[number] };
                          setLines(next);
                        }}
                      >
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PURPOSES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {PURPOSE_CATEGORY_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {line.purpose_category === 'investment' ? (
                      <div className="sm:col-span-3">
                        <Label className="text-xs">Company name</Label>
                        <Input
                          className="mt-1 h-9"
                          value={line.investee_company}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = { ...next[idx]!, investee_company: e.target.value };
                            setLines(next);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="sm:col-span-3" />
                    )}
                    <div className="sm:col-span-3">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="mt-1 h-9"
                        value={line.description}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = { ...next[idx]!, description: e.target.value };
                          setLines(next);
                        }}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Amount</Label>
                      <Input
                        type="number"
                        className="mt-1 h-9"
                        value={line.amount}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = { ...next[idx]!, amount: e.target.value };
                          setLines(next);
                        }}
                      />
                    </div>
                    <div className="flex items-end justify-end sm:col-span-12">
                      {lines.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full border-dashed"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    {
                      purpose_category: 'management_fee',
                      investee_company: '',
                      description: '',
                      amount: '',
                      sort_order: prev.length,
                    },
                  ])
                }
              >
                + Add Line Item
              </Button>
              <p className={cn('mt-3 text-sm font-medium', lineSum > 0 ? 'text-emerald-600' : 'text-gray-500')}>
                Total: {fmtMoney(fund.currency, lineSum)}
              </p>
            </div>

            <div className="mt-6">
              <Label>Notes</Label>
              <Textarea className="mt-1" value={callNotes} onChange={(e) => setCallNotes(e.target.value)} rows={3} />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#0B1F45] hover:bg-[#162d5e]"
                disabled={busy || lines.length === 0 || !dateNotice || lineSum <= 0}
                onClick={() => void saveNewCall()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Capital Call
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {payOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setPayOpen(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
            <h2 className="text-lg font-semibold text-[#0B1F45]">Mark as Paid</h2>
            <div className="mt-4">
              <Label>Date paid</Label>
              <Input type="date" className="mt-1" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
            </div>
            <div className="mt-4">
              <Label>Notes (optional)</Label>
              <Textarea className="mt-1" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={3} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setPayOpen(null)}>
                Cancel
              </Button>
              <Button type="button" className="bg-[#0B1F45]" disabled={busy || !payDate} onClick={() => void savePaid()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setEditOpen(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
            <h2 className="text-lg font-semibold text-[#0B1F45]">Edit Capital Call</h2>
            <div className="mt-4">
              <Label>Due date</Label>
              <Input type="date" className="mt-1" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
            </div>
            <div className="mt-4">
              <Label>Notes</Label>
              <Textarea className="mt-1" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditOpen(null)}>
                Cancel
              </Button>
              <Button type="button" className="bg-[#0B1F45]" disabled={busy} onClick={() => void saveEdit()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
