'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowRightLeft, BarChart2, Clock, MoreHorizontal, TrendingUp } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DivestmentRow } from '@/lib/portfolio/divestments';
import { DIVESTMENT_TYPES, USD_EQ_RATE, toUsd } from '@/lib/portfolio/divestments';
import { cn } from '@/lib/utils';

type FundOpt = { id: string; fund_name: string; currency: 'USD' | 'JMD' };
type Payload = {
  divestments: DivestmentRow[];
  summary: {
    total_exits: number;
    total_proceeds_usd: number;
    avg_moic: number;
    by_type: Record<string, number>;
    by_fund: Array<{ fund_id: string; fund_name: string; count: number; total_proceeds: number }>;
  };
};

type FormState = {
  fund_id: string;
  company_name: string;
  divestment_type: string;
  completion_date: string;
  announcement_date: string;
  original_investment_amount: string;
  proceeds_received: string;
  is_full_exit: boolean;
  remaining_stake_pct: string;
  exit_route: string;
  notes: string;
  buyer_name: string;
  status: string;
};

const TYPE_LABELS: Record<string, string> = {
  full_exit: 'Full Exit',
  partial_exit: 'Partial Exit',
  ipo: 'IPO',
  write_off: 'Write-Off',
  return_of_capital: 'Return of Capital',
  management_buyout: 'MBO',
  secondary_sale: 'Secondary',
};

const TYPE_COLORS: Record<string, string> = {
  full_exit: '#0B1F45',
  partial_exit: '#C8973A',
  ipo: '#0F8A6E',
  write_off: '#EF4444',
  return_of_capital: '#3B82F6',
  management_buyout: '#8B5CF6',
  secondary_sale: '#F59E0B',
};

const INITIAL_FORM: FormState = {
  fund_id: '',
  company_name: '',
  divestment_type: 'full_exit',
  completion_date: '',
  announcement_date: '',
  original_investment_amount: '',
  proceeds_received: '',
  is_full_exit: true,
  remaining_stake_pct: '',
  exit_route: '',
  notes: '',
  buyer_name: '',
  status: 'completed',
};

function money(currency: string, n: number): string {
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function typeBadge(type: string): string {
  if (type === 'full_exit') return 'bg-[#0B1F45] text-white';
  if (type === 'partial_exit') return 'bg-amber-50 text-amber-700';
  if (type === 'ipo') return 'bg-teal-50 text-teal-700';
  if (type === 'write_off') return 'bg-red-50 text-red-600';
  if (type === 'return_of_capital') return 'bg-blue-50 text-blue-700';
  if (type === 'management_buyout') return 'bg-purple-50 text-purple-700';
  return 'bg-gray-100 text-gray-600';
}

function statusBadge(status: string): string {
  if (status === 'completed') return 'bg-teal-50 text-teal-700';
  if (status === 'pending') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

export function DivestmentTrackingClient({ initialData, funds }: { initialData: Payload; funds: FundOpt[] }) {
  const [data, setData] = useState(initialData);
  const [fundFilter, setFundFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [openCreate, setOpenCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const r of data.divestments) ys.add(Number(r.completion_date.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [data.divestments]);

  const selectedFund = useMemo(() => funds.find((f) => f.id === form.fund_id) ?? null, [funds, form.fund_id]);

  const reload = useCallback(async () => {
    const p = new URLSearchParams();
    if (fundFilter !== 'all') p.set('fund_id', fundFilter);
    if (typeFilter !== 'all') p.set('type', typeFilter);
    if (statusFilter !== 'all') p.set('status', statusFilter);
    if (yearFilter !== 'all') p.set('year', yearFilter);
    const res = await fetch(`/api/portfolio/divestments?${p.toString()}`);
    const j = (await res.json()) as Payload & { error?: string };
    if (!res.ok) throw new Error(j.error ?? 'Failed to load');
    setData(j);
  }, [fundFilter, typeFilter, statusFilter, yearFilter]);

  const rows = data.divestments;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const weightedMoic = data.summary.avg_moic > 0 ? `${data.summary.avg_moic.toFixed(2)}x` : '—';

  const proceedsByFund = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    for (const r of rows) {
      const fund = funds.find((f) => f.id === r.fund_id);
      const key = r.fund_id;
      const row = map.get(key) ?? { name: (fund?.fund_name ?? 'Fund').slice(0, 18), value: 0 };
      row.value += toUsd(Number(r.proceeds_received), r.currency);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [rows, funds]);

  const pieData = useMemo(
    () =>
      Object.entries(data.summary.by_type)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => ({ name: TYPE_LABELS[type] ?? type, type, value: count })),
    [data.summary.by_type],
  );

  const calcMoic = useMemo(() => {
    const original = Number(form.original_investment_amount);
    const proceeds = Number(form.proceeds_received);
    if (!Number.isFinite(original) || original <= 0 || !Number.isFinite(proceeds)) return null;
    return proceeds / original;
  }, [form.original_investment_amount, form.proceeds_received]);

  const canSubmit =
    form.fund_id &&
    form.company_name.trim() &&
    form.completion_date &&
    Number(form.original_investment_amount) > 0 &&
    Number(form.proceeds_received) >= 0 &&
    (!form.divestment_type.includes('partial') || form.remaining_stake_pct.trim());

  const onEditRow = (row: DivestmentRow) => {
    setEditingId(row.id);
    setForm({
      fund_id: row.fund_id,
      company_name: row.company_name,
      divestment_type: row.divestment_type,
      completion_date: row.completion_date,
      announcement_date: row.announcement_date ?? '',
      original_investment_amount: String(row.original_investment_amount),
      proceeds_received: String(row.proceeds_received),
      is_full_exit: row.is_full_exit,
      remaining_stake_pct: row.remaining_stake_pct == null ? '' : String(row.remaining_stake_pct),
      exit_route: row.exit_route ?? '',
      notes: row.notes ?? '',
      buyer_name: row.buyer_name ?? '',
      status: row.status,
    });
    setMenuRow(null);
    setOpenCreate(true);
  };

  const onSave = async () => {
    if (!selectedFund) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(editingId ? `/api/portfolio/divestments/${editingId}` : '/api/portfolio/divestments', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fund_id: form.fund_id,
          company_name: form.company_name,
          divestment_type: form.divestment_type,
          completion_date: form.completion_date,
          announcement_date: form.announcement_date || null,
          original_investment_amount: Number(form.original_investment_amount),
          proceeds_received: Number(form.proceeds_received),
          currency: selectedFund.currency,
          is_full_exit: form.is_full_exit,
          remaining_stake_pct: form.is_full_exit ? null : Number(form.remaining_stake_pct),
          exit_route: form.exit_route || null,
          notes: form.notes || null,
          buyer_name: form.buyer_name || null,
          status: form.status,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed to save');
      setOpenCreate(false);
      setEditingId(null);
      setForm(INITIAL_FORM);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const onCancelRow = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/divestments/${id}`, { method: 'DELETE' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
      setMenuRow(null);
    }
  };

  return (
    <div className="space-y-6 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45]">Divestment Summary</h1>
          <p className="mt-1 text-sm text-gray-400">Fund exits and returns of capital</p>
        </div>
        <Button
          className="bg-[#0B1F45] text-white hover:bg-[#162d5e]"
          onClick={() => {
            setEditingId(null);
            setForm(INITIAL_FORM);
            setOpenCreate(true);
          }}
        >
          + Record Divestment
        </Button>
      </div>

      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 border-t-4 border-t-[#0B1F45] bg-white p-4">
          <ArrowRightLeft className="h-5 w-5 text-[#0B1F45]" />
          <p className="mt-3 text-2xl font-bold text-[#0B1F45]">{data.summary.total_exits}</p>
          <p className="text-sm font-medium text-gray-700">Total Exits</p>
          <p className="text-xs text-gray-400">Completed transactions</p>
        </div>
        <div className="rounded-xl border border-gray-200 border-t-4 border-t-[#0F8A6E] bg-white p-4">
          <TrendingUp className="h-5 w-5 text-[#0F8A6E]" />
          <p className="mt-3 text-2xl font-bold text-[#0B1F45]">USD {data.summary.total_proceeds_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-sm font-medium text-gray-700">Total Proceeds</p>
          <p className="text-xs text-gray-400">USD equivalent</p>
        </div>
        <div className="rounded-xl border border-gray-200 border-t-4 border-t-[#C8973A] bg-white p-4">
          <BarChart2 className="h-5 w-5 text-[#C8973A]" />
          <p className="mt-3 text-2xl font-bold text-[#0B1F45]">{weightedMoic}</p>
          <p className="text-sm font-medium text-gray-700">Avg. MOIC</p>
          <p className="text-xs text-gray-400">Multiple on invested capital</p>
        </div>
        <div className={cn('rounded-xl border border-gray-200 border-t-4 bg-white p-4', pending > 0 ? 'border-t-amber-500' : 'border-t-gray-300')}>
          <Clock className={cn('h-5 w-5', pending > 0 ? 'text-amber-500' : 'text-gray-400')} />
          <p className="mt-3 text-2xl font-bold text-[#0B1F45]">{pending}</p>
          <p className="text-sm font-medium text-gray-700">Pending</p>
          <p className="text-xs text-gray-400">Announced, not completed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <p className="text-sm font-semibold text-[#0B1F45]">Proceeds by Fund</p>
          {proceedsByFund.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center text-gray-400">
              <ArrowRightLeft className="h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm">No exits recorded yet</p>
            </div>
          ) : (
            <div className="mt-4 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={proceedsByFund}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0F8A6E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-semibold text-[#0B1F45]">By Exit Type</p>
          {pieData.length === 0 ? (
            <div className="mt-10 text-center text-sm text-gray-400">No type data</div>
          ) : (
            <>
              <div className="mt-2 h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {pieData.map((entry) => (
                        <Cell key={entry.type} fill={TYPE_COLORS[entry.type] ?? '#9CA3AF'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 text-sm">
                {pieData.map((t) => (
                  <div key={t.type} className="flex items-center justify-between">
                    <span className="text-gray-600">{t.name}</span>
                    <span className="font-semibold text-[#0B1F45]">{t.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap gap-3 border-b border-gray-100 px-4 py-3">
          <select className="h-10 rounded border border-gray-300 px-3 text-sm" value={fundFilter} onChange={(e) => setFundFilter(e.target.value)}>
            <option value="all">All funds</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.fund_name}
              </option>
            ))}
          </select>
          <select className="h-10 rounded border border-gray-300 px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {DIVESTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select className="h-10 rounded border border-gray-300 px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="h-10 rounded border border-gray-300 px-3 text-sm" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => void reload()}>
            Apply
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <ArrowRightLeft className="h-12 w-12 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-500">No divestments recorded</p>
            <p className="mt-1 text-xs text-gray-400">Record fund exits and returns of capital as they occur across the portfolio</p>
            <Button
              className="mt-4 bg-[#0B1F45] text-white hover:bg-[#162d5e]"
              onClick={() => {
                setEditingId(null);
                setForm(INITIAL_FORM);
                setOpenCreate(true);
              }}
            >
              + Record First Divestment
            </Button>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Fund</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Original Investment</th>
                <th className="px-3 py-2">Proceeds</th>
                <th className="px-3 py-2">MOIC</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const fund = funds.find((f) => f.id === r.fund_id);
                const moic = Number(r.multiple_on_invested_capital ?? 0);
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-[#0B1F45]">{r.company_name}</p>
                      {r.buyer_name ? <p className="text-xs text-gray-400">→ {r.buyer_name}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <p>{fund?.fund_name ?? 'Fund'}</p>
                      <span className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-xs', r.currency === 'JMD' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700')}>
                        {r.currency}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', typeBadge(r.divestment_type))}>
                        {TYPE_LABELS[r.divestment_type] ?? r.divestment_type}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.status === 'pending' && r.announcement_date ? `${fmtDate(r.announcement_date)} (pending)` : fmtDate(r.completion_date)}</td>
                    <td className="px-3 py-2 text-gray-600">{money(r.currency, Number(r.original_investment_amount))}</td>
                    <td className="px-3 py-2 font-semibold text-[#0F8A6E]">{money(r.currency, Number(r.proceeds_received))}</td>
                    <td className={cn('px-3 py-2', moic > 2 ? 'font-bold text-teal-600' : moic >= 1 ? 'font-semibold text-[#0B1F45]' : 'text-red-600')}>
                      {moic.toFixed(2)}x
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', statusBadge(r.status))}>
                        {r.status[0]?.toUpperCase()}
                        {r.status.slice(1)}
                      </span>
                    </td>
                    <td className="relative px-3 py-2 text-right">
                      <button className="rounded p-1 hover:bg-gray-100" onClick={() => setMenuRow(menuRow === r.id ? null : r.id)} type="button">
                        <MoreHorizontal className="h-4 w-4 text-gray-500" />
                      </button>
                      {menuRow === r.id ? (
                        <div className="absolute right-3 z-10 mt-1 w-28 rounded border border-gray-200 bg-white text-left text-xs shadow">
                          <button type="button" className="block w-full px-3 py-2 text-left hover:bg-gray-50" onClick={() => onEditRow(r)}>
                            Edit
                          </button>
                          <button type="button" className="block w-full px-3 py-2 text-left text-red-600 hover:bg-gray-50" onClick={() => void onCancelRow(r.id)}>
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0B1F45]">{editingId ? 'Edit Divestment' : 'Record Divestment'}</h3>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <label className="text-sm">
                <span>Fund *</span>
                <select className="mt-1 h-10 w-full rounded border border-gray-300 px-3" value={form.fund_id} onChange={(e) => setForm((s) => ({ ...s, fund_id: e.target.value }))}>
                  <option value="">Select fund</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.fund_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span>Company Name *</span>
                <Input value={form.company_name} onChange={(e) => setForm((s) => ({ ...s, company_name: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span>Exit Type *</span>
                <select className="mt-1 h-10 w-full rounded border border-gray-300 px-3" value={form.divestment_type} onChange={(e) => setForm((s) => ({ ...s, divestment_type: e.target.value }))}>
                  {DIVESTMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span>Buyer/Counterparty</span>
                <Input value={form.buyer_name} onChange={(e) => setForm((s) => ({ ...s, buyer_name: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span>Completion Date *</span>
                <Input type="date" value={form.completion_date} onChange={(e) => setForm((s) => ({ ...s, completion_date: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span>Announcement Date</span>
                <Input type="date" value={form.announcement_date} onChange={(e) => setForm((s) => ({ ...s, announcement_date: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span>Original Investment Amount *</span>
                <Input type="number" value={form.original_investment_amount} onChange={(e) => setForm((s) => ({ ...s, original_investment_amount: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span>Proceeds Received *</span>
                <Input type="number" value={form.proceeds_received} onChange={(e) => setForm((s) => ({ ...s, proceeds_received: e.target.value }))} />
              </label>
            </div>
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">MOIC</p>
              <p className={cn('text-2xl font-bold', calcMoic == null ? 'text-gray-400' : calcMoic < 1 ? 'text-red-600' : calcMoic > 2 ? 'text-teal-600' : 'text-[#0B1F45]')}>
                {calcMoic == null ? '—' : `${calcMoic.toFixed(2)}x`}
              </p>
            </div>
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_full_exit} onChange={(e) => setForm((s) => ({ ...s, is_full_exit: e.target.checked }))} />
                Full Exit
              </label>
              {!form.is_full_exit ? (
                <label className="text-sm">
                  <span>Remaining Stake %</span>
                  <Input type="number" value={form.remaining_stake_pct} onChange={(e) => setForm((s) => ({ ...s, remaining_stake_pct: e.target.value }))} />
                </label>
              ) : null}
              <label className="text-sm">
                <span>Exit Route</span>
                <Input value={form.exit_route} onChange={(e) => setForm((s) => ({ ...s, exit_route: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span>Notes</span>
                <textarea className="mt-1 min-h-[72px] w-full rounded border border-gray-300 px-3 py-2" value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setOpenCreate(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
              <Button disabled={!canSubmit || busy} className="bg-[#0B1F45] text-white hover:bg-[#162d5e]" onClick={() => void onSave()}>
                {editingId ? 'Save Changes' : 'Record Divestment'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
