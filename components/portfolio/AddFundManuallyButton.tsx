'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const MONTHS = [
  { v: 1, l: 'January' },
  { v: 2, l: 'February' },
  { v: 3, l: 'March' },
  { v: 4, l: 'April' },
  { v: 5, l: 'May' },
  { v: 6, l: 'June' },
  { v: 7, l: 'July' },
  { v: 8, l: 'August' },
  { v: 9, l: 'September' },
  { v: 10, l: 'October' },
  { v: 11, l: 'November' },
  { v: 12, l: 'December' },
];

export function AddFundManuallyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fundName, setFundName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'JMD'>('USD');
  const [totalFund, setTotalFund] = useState('');
  const [dbj, setDbj] = useState('');
  const [prata, setPrata] = useState('33.33');
  const [yearEnd, setYearEnd] = useState(12);
  const [exRate, setExRate] = useState('157');

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/portfolio/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fund_name: fundName.trim(),
          manager_name: managerName.trim(),
          currency,
          total_fund_commitment: Number(totalFund),
          dbj_commitment: Number(dbj),
          dbj_pro_rata_pct: Number(prata),
          year_end_month: yearEnd,
          exchange_rate_jmd_usd: currency === 'JMD' ? Number(exRate) : undefined,
        }),
      });
      const j = (await res.json()) as { fund?: { id: string }; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setOpen(false);
      if (j.fund?.id) router.push(`/portfolio/funds/${j.fund.id}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" className="rounded-xl bg-[#0B1F45] hover:bg-[#162d5e]" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Fund Manually
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className={cn(
              'relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl',
            )}
            role="dialog"
            aria-modal
            aria-labelledby="add-fund-title"
          >
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:bg-gray-100"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 id="add-fund-title" className="text-lg font-semibold text-[#0B1F45]">
              Add portfolio fund
            </h2>
            {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
            <div className="mt-4 grid gap-3">
              <div>
                <Label htmlFor="pf-name">Fund name</Label>
                <Input id="pf-name" value={fundName} onChange={(e) => setFundName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pf-mgr">Manager name</Label>
                <Input id="pf-mgr" value={managerName} onChange={(e) => setManagerName(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Currency</Label>
                  <select
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'USD' | 'JMD')}
                  >
                    <option value="USD">USD</option>
                    <option value="JMD">JMD</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="pf-ye">Year end month</Label>
                  <select
                    id="pf-ye"
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={yearEnd}
                    onChange={(e) => setYearEnd(Number(e.target.value))}
                  >
                    {MONTHS.map((m) => (
                      <option key={m.v} value={m.v}>
                        {m.l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="pf-total">Total fund commitment</Label>
                <Input id="pf-total" type="number" value={totalFund} onChange={(e) => setTotalFund(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pf-dbj">DBJ commitment</Label>
                <Input id="pf-dbj" type="number" value={dbj} onChange={(e) => setDbj(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pf-pr">DBJ pro-rata %</Label>
                <Input id="pf-pr" type="number" step="0.01" value={prata} onChange={(e) => setPrata(e.target.value)} className="mt-1" />
              </div>
              {currency === 'JMD' ? (
                <div>
                  <Label htmlFor="pf-ex">Exchange rate JMD/USD</Label>
                  <Input id="pf-ex" type="number" step="0.01" value={exRate} onChange={(e) => setExRate(e.target.value)} className="mt-1" />
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              className="mt-6 w-full bg-[#0F8A6E] hover:bg-[#0c6f58]"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? 'Saving…' : 'Create fund'}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
