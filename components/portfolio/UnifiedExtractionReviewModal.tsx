'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { upsertFundSnapshotAction } from '@/app/(auth)/portfolio/funds/[id]/fund-snapshot-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cloneNarrativePayload, NarrativeExtractFormBody } from '@/components/portfolio/NarrativeExtractFormBody';
import type { NarrativeExtractionPayload } from '@/lib/portfolio/narrative-extraction';
import type { SnapshotExtractedFields, SnapshotExtractionConfidence } from '@/lib/portfolio/snapshot-extraction';
import { cn } from '@/lib/utils';

export type UnifiedExtractSnapshotBranch = {
  ok: boolean;
  extracted: SnapshotExtractedFields | null;
  confidence: Record<string, string> | null;
  skipped?: boolean;
  error?: string;
};

export type UnifiedExtractNarrativeBranch = {
  ok: boolean;
  extract_id: string | null;
  narrative: NarrativeExtractionPayload['narrative'] | null;
  indicators: NarrativeExtractionPayload['indicators'] | null;
  allocations: unknown | null;
  fund_lps: unknown | null;
  pipeline_stats: unknown | null;
  fund_profile: unknown | null;
  capital_account_detail: unknown | null;
  confidence: Record<string, string> | null;
  source_snippets: unknown | null;
  error?: string;
};

export type UnifiedExtractApiResponse = {
  snapshot: UnifiedExtractSnapshotBranch;
  narrative: UnifiedExtractNarrativeBranch;
  fund_id: string;
  obligation_id: string;
  document_name: string | null;
};

const SNAP_CONF: { key: keyof SnapshotExtractedFields | 'reported_irr_pct'; label: string }[] = [
  { key: 'period_year', label: 'Year' },
  { key: 'period_quarter', label: 'Q' },
  { key: 'snapshot_date', label: 'Date' },
  { key: 'nav', label: 'NAV' },
  { key: 'reported_irr_pct', label: 'IRR' },
  { key: 'committed_capital', label: 'Commit' },
  { key: 'distributions_in_period', label: 'Dist.' },
];

function snapConfDot(level: string | undefined) {
  const l = (level ?? 'low').toLowerCase();
  if (l === 'high') return 'bg-emerald-500';
  if (l === 'medium') return 'bg-amber-400';
  return 'bg-gray-300';
}

function SnapshotConfidenceStrip({ confidence }: { confidence: SnapshotExtractionConfidence | null | undefined }) {
  if (!confidence || Object.keys(confidence).length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-[#F8F9FF] px-3 py-2 text-xs">
      <p className="font-medium text-[#0B1F45]">Extraction confidence</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {SNAP_CONF.map(({ key, label }) => {
          const k = key === 'reported_irr_pct' ? 'reported_irr_pct' : key;
          const lvl = confidence[k as string];
          if (!lvl) return null;
          return (
            <div key={k} className="flex items-center gap-1.5 text-gray-600">
              <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', snapConfDot(lvl))} title={lvl} />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function defaultIndicators(): NarrativeExtractionPayload['indicators'] {
  return {
    team_size: null,
    team_turnover: null,
    fundraising_status: null,
    fundraising_raised_pct: null,
    pipeline_count: null,
    pipeline_value: null,
    audit_status: null,
    jamaica_focus: null,
    sme_focus: null,
    investments_made: null,
  };
}

function narrativePayloadFromBranch(n: UnifiedExtractNarrativeBranch): NarrativeExtractionPayload | null {
  if (!n.ok || !n.extract_id || !n.narrative) return null;
  return {
    narrative: n.narrative,
    indicators: { ...defaultIndicators(), ...(n.indicators ?? {}) },
    fund_profile: (n.fund_profile ?? null) as NarrativeExtractionPayload['fund_profile'],
    allocations: (n.allocations ?? null) as NarrativeExtractionPayload['allocations'],
    fund_lps: (n.fund_lps ?? null) as NarrativeExtractionPayload['fund_lps'],
    pipeline_stats: (n.pipeline_stats ?? null) as NarrativeExtractionPayload['pipeline_stats'],
    capital_account_detail: (n.capital_account_detail ?? null) as NarrativeExtractionPayload['capital_account_detail'],
    confidence: (n.confidence ?? {}) as NarrativeExtractionPayload['confidence'],
    source_snippets: (n.source_snippets ?? {}) as NarrativeExtractionPayload['source_snippets'],
  };
}

function quarterLabel(y: number, q: number) {
  return `Q${q} ${y}`;
}

function serializeSnap(
  periodYear: number,
  periodQuarter: number,
  snapshotDate: string,
  nav: string,
  committed: string,
  distPeriod: string,
  reportedIrrPct: string,
  remark: string,
) {
  return JSON.stringify({
    periodYear,
    periodQuarter,
    snapshotDate,
    nav,
    committed,
    distPeriod,
    reportedIrrPct,
    remark,
  });
}

type Tab = 'snapshot' | 'narrative';

export function UnifiedExtractionReviewModal({
  open,
  fundId,
  sourceObligationId,
  data,
  onClose,
  onSaved,
}: {
  open: boolean;
  fundId: string;
  sourceObligationId: string;
  data: UnifiedExtractApiResponse;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('snapshot');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const snap = data.snapshot;
  const narr = data.narrative;

  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodQuarter, setPeriodQuarter] = useState(1);
  const [snapshotDate, setSnapshotDate] = useState('');
  const [nav, setNav] = useState('');
  const [committed, setCommitted] = useState('');
  const [distPeriod, setDistPeriod] = useState('');
  const [reportedIrrPct, setReportedIrrPct] = useState('');
  const [remark, setRemark] = useState('');
  const [snapConfidence, setSnapConfidence] = useState<SnapshotExtractionConfidence | null>(null);
  const [baselineSnap, setBaselineSnap] = useState('');

  const [narrDraft, setNarrDraft] = useState<NarrativeExtractionPayload | null>(null);
  const [baselineNarr, setBaselineNarr] = useState('');

  const resetFromProps = useCallback(() => {
    setErr(null);
    if (snap.skipped) {
      setPeriodYear(new Date().getFullYear());
      setPeriodQuarter(1);
      setSnapshotDate('');
      setNav('');
      setCommitted('');
      setDistPeriod('');
      setReportedIrrPct('');
      setRemark('');
      setSnapConfidence(null);
      setBaselineSnap('skipped');
    } else if (snap.extracted) {
      const ex = snap.extracted;
      setPeriodYear(ex.period_year);
      setPeriodQuarter(ex.period_quarter);
      setSnapshotDate(ex.snapshot_date);
      setNav(String(ex.nav));
      setCommitted(ex.committed_capital != null ? String(ex.committed_capital) : '');
      setDistPeriod(ex.distributions_in_period != null ? String(ex.distributions_in_period) : '');
      setReportedIrrPct(ex.reported_irr_pct != null ? String(ex.reported_irr_pct) : '');
      setRemark(ex.investor_remark ?? '');
      setSnapConfidence((snap.confidence ?? {}) as SnapshotExtractionConfidence);
      setBaselineSnap(
        serializeSnap(
          ex.period_year,
          ex.period_quarter,
          ex.snapshot_date,
          String(ex.nav),
          ex.committed_capital != null ? String(ex.committed_capital) : '',
          ex.distributions_in_period != null ? String(ex.distributions_in_period) : '',
          ex.reported_irr_pct != null ? String(ex.reported_irr_pct) : '',
          ex.investor_remark ?? '',
        ),
      );
    } else {
      const y = new Date().getFullYear();
      const m = new Date().getMonth() + 1;
      const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
      setPeriodYear(y);
      setPeriodQuarter(q);
      setSnapshotDate('');
      setNav('');
      setCommitted('');
      setDistPeriod('');
      setReportedIrrPct('');
      setRemark('');
      setSnapConfidence(null);
      setBaselineSnap(serializeSnap(y, q, '', '', '', '', '', ''));
    }

    const np = narrativePayloadFromBranch(narr);
    if (np) {
      const cloned = cloneNarrativePayload(np);
      setNarrDraft(cloned);
      setBaselineNarr(JSON.stringify(cloned));
    } else {
      setNarrDraft(null);
      setBaselineNarr('');
    }
  }, [snap, narr]);

  useEffect(() => {
    if (!open) return;
    resetFromProps();
  }, [open, resetFromProps]);

  const snapSerialized = useMemo(
    () => serializeSnap(periodYear, periodQuarter, snapshotDate, nav, committed, distPeriod, reportedIrrPct, remark),
    [periodYear, periodQuarter, snapshotDate, nav, committed, distPeriod, reportedIrrPct, remark],
  );

  const snapDirty = snap.skipped ? false : baselineSnap !== 'skipped' && snapSerialized !== baselineSnap;

  const narrDirty = narrDraft && baselineNarr ? JSON.stringify(narrDraft) !== baselineNarr : false;

  if (!open) return null;

  const saveAll = async () => {
    setBusy(true);
    setErr(null);
    const results: string[] = [];
    const errors: string[] = [];

    if (!snap.skipped) {
      const navN = Number(nav);
      if (!snapshotDate.trim() || Number.isNaN(navN) || navN < 0) {
        errors.push('Snapshot: date and NAV are required to save performance data.');
      } else {
        const base = {
          period_year: periodYear,
          period_quarter: periodQuarter,
          snapshot_date: snapshotDate.trim(),
          nav: navN,
          committed_capital: committed.trim() ? Number(committed) : null,
          distributions_in_period: distPeriod.trim() ? Number(distPeriod) : null,
          reported_irr_pct: reportedIrrPct.trim() ? Number(reportedIrrPct) : null,
          investor_remark: remark.trim() || null,
          source_obligation_id: sourceObligationId,
          ...(snapConfidence && Object.keys(snapConfidence).length > 0
            ? { extraction_confidence: snapConfidence as Record<string, unknown> }
            : {}),
        };
        const res = await upsertFundSnapshotAction(fundId, base);
        if (!res.ok) errors.push(`Snapshot: ${res.error}`);
        else results.push('Performance snapshot saved.');
      }
    }

    if (narr.extract_id && narrDraft) {
      const body = {
        narrative: narrDraft.narrative,
        indicators: narrDraft.indicators,
        fund_profile: narrDraft.fund_profile,
        allocations: narrDraft.allocations,
        fund_lps: narrDraft.fund_lps,
        pipeline_stats: narrDraft.pipeline_stats,
        capital_account_detail: narrDraft.capital_account_detail,
        confidence: narrDraft.confidence,
        source_snippets: narrDraft.source_snippets,
      };
      const res = await fetch(`/api/portfolio/narrative-extracts/${narr.extract_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) errors.push(`Narrative: ${j.error ?? 'Save failed'}`);
      else results.push('Narrative extract saved.');
    }

    setBusy(false);

    if (results.length) onSaved(results.join(' '));
    if (errors.length) setErr(errors.join(' '));
    if (errors.length === 0) onClose();
  };

  const docLabel = data.document_name?.trim() || 'Uploaded document';

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-[#0B1F45]">Review extracted report data</h2>
          <p className="mt-1 text-xs text-gray-500">Source: {docLabel}</p>
        </div>

        <div className="flex border-b border-gray-200 px-4">
          <button
            type="button"
            className={cn(
              'relative flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium',
              tab === 'snapshot' ? 'border-[#0B1F45] text-[#0B1F45]' : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
            onClick={() => setTab('snapshot')}
          >
            Snapshot data
            {!snap.ok && !snap.skipped ? <span className="h-2 w-2 rounded-full bg-red-500" title="Extraction failed" /> : null}
            {snapDirty ? <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" /> : null}
          </button>
          <button
            type="button"
            className={cn(
              'relative flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium',
              tab === 'narrative' ? 'border-[#0B1F45] text-[#0B1F45]' : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
            onClick={() => setTab('narrative')}
          >
            Narrative &amp; indicators
            {!narr.ok ? <span className="h-2 w-2 rounded-full bg-red-500" title="Extraction failed" /> : null}
            {narrDirty ? <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" /> : null}
          </button>
        </div>

        <div className="max-h-[min(70vh,640px)] overflow-y-auto px-6 py-4">
          {err ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

          {tab === 'snapshot' ? (
            <div>
              {snap.skipped ? (
                <p className="text-sm text-gray-700">
                  Performance data was already saved for this obligation. You can review or edit it under the Performance tab.
                </p>
              ) : (
                <>
                  {!snap.ok ? <p className="mb-3 text-sm text-red-700">Snapshot extraction failed: {snap.error ?? 'Unknown error'}</p> : null}
                  {snap.extracted || !snap.ok ? (
                    <p className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
                      Values below were suggested from the uploaded report. Review every field before saving.
                    </p>
                  ) : null}
                  <p className="text-xs text-gray-500">{quarterLabel(periodYear, periodQuarter)}</p>
                  <SnapshotConfidenceStrip confidence={snapConfidence ?? undefined} />
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Period year</Label>
                      <Input type="number" className="mt-1" value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))} min={2000} max={2100} />
                    </div>
                    <div>
                      <Label>Quarter (1–4)</Label>
                      <Input type="number" className="mt-1" value={periodQuarter} onChange={(e) => setPeriodQuarter(Number(e.target.value))} min={1} max={4} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Snapshot date</Label>
                      <Input type="date" className="mt-1" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>NAV (fund currency)</Label>
                      <Input type="number" step="any" className="mt-1" value={nav} onChange={(e) => setNav(e.target.value)} />
                    </div>
                    <div>
                      <Label>Committed capital (optional)</Label>
                      <Input type="number" step="any" className="mt-1" value={committed} onChange={(e) => setCommitted(e.target.value)} />
                    </div>
                    <div>
                      <Label>Distributions in period (optional)</Label>
                      <Input type="number" step="any" className="mt-1" value={distPeriod} onChange={(e) => setDistPeriod(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Reported IRR % (optional)</Label>
                      <Input type="number" step="any" className="mt-1" value={reportedIrrPct} onChange={(e) => setReportedIrrPct(e.target.value)} placeholder="e.g. 15.5" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Investor remark (optional)</Label>
                      <Textarea className="mt-1" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : narrDraft ? (
            <NarrativeExtractFormBody
              draft={narrDraft}
              setDraft={
                ((action) => {
                  setNarrDraft((prev) => {
                    if (!prev) return prev;
                    return typeof action === 'function' ? action(prev) : action;
                  });
                }) as Dispatch<SetStateAction<NarrativeExtractionPayload>>
              }
            />
          ) : (
            <p className="text-sm text-red-700">Narrative extraction failed or could not be saved: {narr.error ?? 'Unknown error'}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="bg-[#0B1F45] hover:bg-[#162d5e]" disabled={busy} onClick={() => void saveAll()}>
            {busy ? 'Saving…' : 'Save all'}
          </Button>
        </div>
      </div>
    </div>
  );
}
