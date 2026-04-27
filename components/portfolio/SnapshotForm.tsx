'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { RepaymentStatus } from '@/lib/portfolio/types';
import type { Trend } from '@/lib/portfolio/scoring';

const REPAYMENT: { value: RepaymentStatus; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'delinquent', label: 'Delinquent' },
  { value: 'default', label: 'Default' },
];

const TRENDS: { value: Trend; label: string }[] = [
  { value: 'improving', label: 'Improving' },
  { value: 'stable', label: 'Stable' },
  { value: 'declining', label: 'Declining' },
];

export function SnapshotForm({
  investmentId,
  onSaved,
  disabled,
}: {
  investmentId: string;
  onSaved?: () => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [snapshotDate, setSnapshotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [revenueUsd, setRevenueUsd] = useState('');
  const [ebitdaUsd, setEbitdaUsd] = useState('');
  const [valuationUsd, setValuationUsd] = useState('');
  const [repayment, setRepayment] = useState<RepaymentStatus>('current');
  const [revenueTrend, setRevenueTrend] = useState<Trend>('stable');
  const [valuationTrend, setValuationTrend] = useState<Trend>('stable');
  const [notes, setNotes] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body = {
        snapshot_date: snapshotDate,
        repayment_status: repayment,
        revenue_trend: revenueTrend,
        valuation_trend: valuationTrend,
        revenue_usd: revenueUsd.trim() === '' ? null : Number(revenueUsd),
        ebitda_usd: ebitdaUsd.trim() === '' ? null : Number(ebitdaUsd),
        valuation_usd: valuationUsd.trim() === '' ? null : Number(valuationUsd),
        notes: notes.trim() === '' ? null : notes.trim(),
      };
      if (
        (body.revenue_usd != null && !Number.isFinite(body.revenue_usd)) ||
        (body.ebitda_usd != null && !Number.isFinite(body.ebitda_usd)) ||
        (body.valuation_usd != null && !Number.isFinite(body.valuation_usd))
      ) {
        setErr('Enter valid numbers for financial fields.');
        return;
      }

      const res = await fetch(`/api/investments/${investmentId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Save failed');
        return;
      }
      onSaved?.();
      setNotes('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell">
      <div>
        <h3 className="text-sm font-semibold text-navy">Add performance snapshot</h3>
        <p className="mt-1 text-xs text-navy/55">
          Use the period end date (quarterly or annual). Score is computed on the server from repayment and trends.
        </p>
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="snapshot_date">Snapshot date</Label>
          <Input
            id="snapshot_date"
            type="date"
            value={snapshotDate}
            onChange={(e) => setSnapshotDate(e.target.value)}
            required
            disabled={disabled || busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repayment">Repayment status</Label>
          <select
            id="repayment"
            className="flex h-10 w-full rounded-md border border-shell-border bg-white px-3 py-2 text-sm text-navy"
            value={repayment}
            onChange={(e) => setRepayment(e.target.value as RepaymentStatus)}
            disabled={disabled || busy}
          >
            {REPAYMENT.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rev_trend">Revenue trend</Label>
          <select
            id="rev_trend"
            className="flex h-10 w-full rounded-md border border-shell-border bg-white px-3 py-2 text-sm text-navy"
            value={revenueTrend}
            onChange={(e) => setRevenueTrend(e.target.value as Trend)}
            disabled={disabled || busy}
          >
            {TRENDS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="val_trend">Valuation trend</Label>
          <select
            id="val_trend"
            className="flex h-10 w-full rounded-md border border-shell-border bg-white px-3 py-2 text-sm text-navy"
            value={valuationTrend}
            onChange={(e) => setValuationTrend(e.target.value as Trend)}
            disabled={disabled || busy}
          >
            {TRENDS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="revenue_usd">Revenue (USD)</Label>
          <Input
            id="revenue_usd"
            inputMode="decimal"
            placeholder="Optional"
            value={revenueUsd}
            onChange={(e) => setRevenueUsd(e.target.value)}
            disabled={disabled || busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ebitda_usd">EBITDA (USD)</Label>
          <Input
            id="ebitda_usd"
            inputMode="decimal"
            placeholder="Optional"
            value={ebitdaUsd}
            onChange={(e) => setEbitdaUsd(e.target.value)}
            disabled={disabled || busy}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="valuation_usd">Valuation (USD)</Label>
          <Input
            id="valuation_usd"
            inputMode="decimal"
            placeholder="Optional"
            value={valuationUsd}
            onChange={(e) => setValuationUsd(e.target.value)}
            disabled={disabled || busy}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled || busy}
            placeholder="Qualitative commentary for this period"
          />
        </div>
      </div>

      <Button type="submit" className="bg-navy text-navy-foreground" disabled={disabled || busy}>
        {busy ? 'Saving…' : 'Save snapshot'}
      </Button>
    </form>
  );
}
