'use client';

import { useCallback, useEffect, useState } from 'react';

import { PortfolioCharts } from '@/components/portfolio/PortfolioCharts';
import { PortfolioSummaryCards } from '@/components/portfolio/PortfolioSummaryCards';
import type { PortfolioTableRow } from '@/components/portfolio/PortfolioTable';
import { PortfolioTable } from '@/components/portfolio/PortfolioTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type SummaryJson = {
  active_investment_count: number;
  total_approved_usd: number;
  total_disbursed_usd: number;
  average_performance_score: number | null;
  investments_at_risk_count: number;
  sectors: string[];
  risk_distribution: {
    performing: number;
    watch: number;
    underperforming: number;
    critical: number;
  };
  deployment_by_month: { month: string; amount_usd: number }[];
  sector_exposure: { sector: string; amount_usd: number }[];
  repayment_breakdown: { current: number; delinquent: number; default: number };
};

export function PortfolioDashboard() {
  const [summary, setSummary] = useState<SummaryJson | null>(null);
  const [rows, setRows] = useState<PortfolioTableRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sector, setSector] = useState('all');
  const [band, setBand] = useState('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/portfolio/summary');
    const j = (await res.json()) as SummaryJson & { error?: string };
    if (!res.ok) throw new Error(j.error ?? 'Failed to load summary');
    setSummary(j);
  }, []);

  const loadInvestments = useCallback(async () => {
    const q = new URLSearchParams();
    if (sector && sector !== 'all') q.set('sector', sector);
    if (band && band !== 'all') q.set('band', band);
    if (search.trim()) q.set('search', search.trim());
    const res = await fetch(`/api/portfolio/investments?${q.toString()}`);
    const j = (await res.json()) as { investments?: PortfolioTableRow[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? 'Failed to load investments');
    setRows(j.investments ?? []);
  }, [sector, band, search]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setErr(null);
      setLoadingSummary(true);
      try {
        await loadSummary();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load summary');
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSummary]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setErr(null);
      setLoadingRows(true);
      try {
        await loadInvestments();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load investments');
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInvestments]);

  return (
    <div className="space-y-8">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{err}</div>
      )}

      {loadingSummary && !summary ? (
        <p className="text-sm text-navy/60">Loading portfolio…</p>
      ) : summary ? (
        <PortfolioSummaryCards summary={summary} />
      ) : null}

      {summary && (
        <PortfolioCharts
          riskDistribution={summary.risk_distribution}
          deployment_by_month={summary.deployment_by_month}
          sector_exposure={summary.sector_exposure}
          repayment_breakdown={summary.repayment_breakdown}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy">Active investments</h2>
            <p className="text-sm text-navy/55">Sort columns and open detail to add snapshots or reports.</p>
            {loadingRows && <p className="mt-1 text-xs text-navy/45">Updating table…</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="pf_sector">Sector</Label>
              <select
                id="pf_sector"
                className="flex h-10 w-full min-w-[140px] rounded-md border border-shell-border bg-white px-3 py-2 text-sm text-navy"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              >
                <option value="all">All sectors</option>
                {(summary?.sectors ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf_band">Band</Label>
              <select
                id="pf_band"
                className="flex h-10 w-full min-w-[140px] rounded-md border border-shell-border bg-white px-3 py-2 text-sm text-navy"
                value={band}
                onChange={(e) => setBand(e.target.value)}
              >
                <option value="all">All bands</option>
                <option value="performing">Performing</option>
                <option value="watch">Watch</option>
                <option value="underperforming">Underperforming</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf_search">Search</Label>
              <div className="flex gap-2">
                <Input
                  id="pf_search"
                  placeholder="Fund name"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSearch(searchDraft);
                  }}
                />
                <Button type="button" variant="outline" className="shrink-0" onClick={() => setSearch(searchDraft)}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>

        <PortfolioTable rows={rows} />
      </div>
    </div>
  );
}
