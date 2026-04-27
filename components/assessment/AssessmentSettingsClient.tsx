'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { VcAssessmentConfig } from '@/types/database';

type FormState = Pick<
  VcAssessmentConfig,
  | 'weight_financial_performance'
  | 'weight_development_impact'
  | 'weight_fund_management'
  | 'weight_compliance_governance'
  | 'weight_portfolio_health'
  | 'lifecycle_early_financial_adj'
  | 'lifecycle_early_management_adj'
  | 'lifecycle_late_financial_adj'
  | 'lifecycle_late_impact_adj'
  | 'threshold_strong'
  | 'threshold_adequate'
  | 'threshold_watchlist'
  | 'watchlist_escalation_quarters'
>;

function toNums(c: VcAssessmentConfig): FormState {
  return {
    weight_financial_performance: Number(c.weight_financial_performance),
    weight_development_impact: Number(c.weight_development_impact),
    weight_fund_management: Number(c.weight_fund_management),
    weight_compliance_governance: Number(c.weight_compliance_governance),
    weight_portfolio_health: Number(c.weight_portfolio_health),
    lifecycle_early_financial_adj: Number(c.lifecycle_early_financial_adj),
    lifecycle_early_management_adj: Number(c.lifecycle_early_management_adj),
    lifecycle_late_financial_adj: Number(c.lifecycle_late_financial_adj),
    lifecycle_late_impact_adj: Number(c.lifecycle_late_impact_adj),
    threshold_strong: Number(c.threshold_strong),
    threshold_adequate: Number(c.threshold_adequate),
    threshold_watchlist: Number(c.threshold_watchlist),
    watchlist_escalation_quarters: Number(c.watchlist_escalation_quarters),
  };
}

export function AssessmentSettingsClient() {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const res = await fetch('/api/portfolio/assessments/config');
    const j = (await res.json()) as { config?: VcAssessmentConfig; error?: string };
    if (!res.ok) {
      setErr(j.error ?? 'Failed to load configuration');
      setForm(null);
    } else if (j.config) {
      setForm(toNums(j.config));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sumWeights = (f: FormState) =>
    f.weight_financial_performance +
    f.weight_development_impact +
    f.weight_fund_management +
    f.weight_compliance_governance +
    f.weight_portfolio_health;

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch('/api/portfolio/assessments/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Save failed');
      setMsg('Saved.');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Loading assessment framework…</p>;
  if (!form) return <p className="text-sm text-red-700">{err ?? 'No configuration loaded.'}</p>;

  const wsum = sumWeights(form);

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#0B1F45]">Quarterly assessment framework</h2>
      <p className="mt-1 text-sm text-gray-600">
        Dimension weights must sum to 100. Thresholds drive category bands and divestment recommendations after approval.
      </p>
      {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}
      {msg ? <p className="mt-3 text-sm text-emerald-800">{msg}</p> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ['weight_financial_performance', 'Financial performance'],
            ['weight_development_impact', 'Development impact'],
            ['weight_fund_management', 'Fund management'],
            ['weight_compliance_governance', 'Compliance & governance'],
            ['weight_portfolio_health', 'Portfolio health'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              type="number"
              className="mt-1"
              value={form[key]}
              onChange={(e) => setForm((f) => (f ? { ...f, [key]: Number(e.target.value) } : f))}
            />
          </div>
        ))}
      </div>
      <p className={cn('mt-2 text-sm', Math.abs(wsum - 100) > 0.01 ? 'font-medium text-red-700' : 'text-gray-500')}>
        Weights sum: {wsum.toFixed(2)} / 100
      </p>

      <h3 className="mt-8 text-sm font-semibold text-[#0B1F45]">Lifecycle adjustments (percentage points)</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {(
          [
            ['lifecycle_early_financial_adj', 'Early — financial'],
            ['lifecycle_early_management_adj', 'Early — management'],
            ['lifecycle_late_financial_adj', 'Late — financial'],
            ['lifecycle_late_impact_adj', 'Late — impact'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              type="number"
              step="0.1"
              className="mt-1"
              value={form[key]}
              onChange={(e) => setForm((f) => (f ? { ...f, [key]: Number(e.target.value) } : f))}
            />
          </div>
        ))}
      </div>

      <h3 className="mt-8 text-sm font-semibold text-[#0B1F45]">Score thresholds (0–100)</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {(
          [
            ['threshold_strong', 'Strong ≥'],
            ['threshold_adequate', 'Adequate ≥'],
            ['threshold_watchlist', 'Watchlist ≥'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              type="number"
              className="mt-1"
              value={form[key]}
              onChange={(e) => setForm((f) => (f ? { ...f, [key]: Number(e.target.value) } : f))}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 max-w-xs">
        <Label htmlFor="weq">Watchlist escalation (consecutive quarters)</Label>
        <Input
          id="weq"
          type="number"
          min={1}
          className="mt-1"
          value={form.watchlist_escalation_quarters}
          onChange={(e) => setForm((f) => (f ? { ...f, watchlist_escalation_quarters: Number(e.target.value) } : f))}
        />
      </div>

      <div className="mt-6">
        <Button type="button" className="bg-[#0F8A6E] hover:bg-[#0c6f58]" disabled={busy || Math.abs(wsum - 100) > 0.01} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save framework'}
        </Button>
      </div>
    </section>
  );
}
