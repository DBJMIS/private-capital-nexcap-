'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DivestmentRow } from '@/lib/portfolio/divestments';

type Fund = { id: string; currency: 'USD' | 'JMD'; fund_name: string };

function money(currency: string, n: number): string {
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function FundDivestmentsTab({ fund, canWrite }: { fund: Fund; canWrite: boolean }) {
  const [rows, setRows] = useState<DivestmentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [type, setType] = useState('full_exit');
  const [date, setDate] = useState('');
  const [original, setOriginal] = useState('');
  const [proceeds, setProceeds] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/divestments`);
      const j = (await res.json()) as { divestments?: DivestmentRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed to load');
      setRows(j.divestments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }, [fund.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const total = rows.length;
    const proceedsSum = rows.reduce((s, r) => s + Number(r.proceeds_received), 0);
    const weighted = rows.reduce((s, r) => s + Number(r.proceeds_received), 0);
    const invested = rows.reduce((s, r) => s + Number(r.original_investment_amount), 0);
    return { total, proceedsSum, moic: invested > 0 ? weighted / invested : null };
  }, [rows]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/divestments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fund_id: fund.id,
          company_name: company,
          divestment_type: type,
          completion_date: date,
          original_investment_amount: Number(original),
          proceeds_received: Number(proceeds),
          currency: fund.currency,
          is_full_exit: type !== 'partial_exit',
          remaining_stake_pct: type === 'partial_exit' ? 50 : null,
          status: 'completed',
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setOpen(false);
      setCompany('');
      setDate('');
      setOriginal('');
      setProceeds('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">Total Exits</p>
            <p className="text-2xl font-bold text-[#0B1F45]">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">Total Proceeds</p>
            <p className="text-2xl font-bold text-[#0B1F45]">{money(fund.currency, summary.proceedsSum)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">Avg MOIC</p>
            <p className="text-2xl font-bold text-[#0B1F45]">{summary.moic == null ? '—' : `${summary.moic.toFixed(2)}x`}</p>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-[#0B1F45]">Divestments</h3>
          {canWrite ? (
            <Button size="sm" className="bg-[#0B1F45] text-white hover:bg-[#162d5e]" onClick={() => setOpen(true)}>
              + Record Exit
            </Button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">{busy ? 'Loading…' : 'No exits recorded for this fund'}</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Proceeds</th>
                <th className="px-3 py-2">MOIC</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-[#0B1F45]">{r.company_name}</td>
                  <td className="px-3 py-2">{r.divestment_type.replaceAll('_', ' ')}</td>
                  <td className="px-3 py-2">{shortDate(r.completion_date)}</td>
                  <td className="px-3 py-2 font-semibold text-[#0F8A6E]">{money(r.currency, Number(r.proceeds_received))}</td>
                  <td className="px-3 py-2">{Number(r.multiple_on_invested_capital ?? 0).toFixed(2)}x</td>
                  <td className="px-3 py-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0B1F45]">Record Divestment</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span>Company *</span>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} />
              </label>
              <label className="text-sm">
                <span>Type *</span>
                <select className="mt-1 h-10 w-full rounded border border-gray-300 px-3" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="full_exit">Full Exit</option>
                  <option value="partial_exit">Partial Exit</option>
                  <option value="ipo">IPO</option>
                  <option value="write_off">Write-Off</option>
                  <option value="return_of_capital">Return of Capital</option>
                  <option value="management_buyout">MBO</option>
                  <option value="secondary_sale">Secondary</option>
                </select>
              </label>
              <label className="text-sm">
                <span>Completion Date *</span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="text-sm">
                <span>Original Investment *</span>
                <Input type="number" value={original} onChange={(e) => setOriginal(e.target.value)} />
              </label>
              <label className="text-sm">
                <span>Proceeds *</span>
                <Input type="number" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button className="bg-[#0B1F45] text-white hover:bg-[#162d5e]" onClick={() => void create()} disabled={!company || !date || !original || !proceeds || busy}>
                Record Divestment
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
