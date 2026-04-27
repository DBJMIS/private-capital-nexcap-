'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { upsertFundSnapshotAction } from '@/app/(auth)/portfolio/funds/[id]/fund-snapshot-actions';
import type { SnapshotExtractionConfidence, SnapshotExtractedFields } from '@/lib/portfolio/snapshot-extraction';
import type { VcFundSnapshot } from '@/types/database';

type Mode = 'add' | 'edit';

function quarterLabel(y: number, q: number) {
  return `Q${q} ${y}`;
}

const CONF_KEYS: { key: keyof SnapshotExtractedFields | 'reported_irr_pct'; label: string }[] = [
  { key: 'period_year', label: 'Year' },
  { key: 'period_quarter', label: 'Q' },
  { key: 'snapshot_date', label: 'Date' },
  { key: 'nav', label: 'NAV' },
  { key: 'reported_irr_pct', label: 'IRR' },
  { key: 'committed_capital', label: 'Commit' },
  { key: 'distributions_in_period', label: 'Dist.' },
];

function confidenceDot(level: string | undefined) {
  const l = (level ?? 'low').toLowerCase();
  if (l === 'high') return 'bg-emerald-500';
  if (l === 'medium') return 'bg-amber-400';
  return 'bg-gray-300';
}

function ConfidenceStrip({ confidence }: { confidence: SnapshotExtractionConfidence | null | undefined }) {
  if (!confidence || Object.keys(confidence).length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-[#F8F9FF] px-3 py-2 text-xs">
      <p className="font-medium text-[#0B1F45]">Extraction confidence</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {CONF_KEYS.map(({ key, label }) => {
          const k = key === 'reported_irr_pct' ? 'reported_irr_pct' : key;
          const lvl = confidence[k as string];
          if (!lvl) return null;
          return (
            <div key={k} className="flex items-center gap-1.5 text-gray-600">
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${confidenceDot(lvl)}`} title={lvl} />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FundPerformanceSnapshotModal({
  fundId,
  mode,
  open,
  initial,
  extractedData,
  sourceObligationId,
  onClose,
  onSaved,
}: {
  fundId: string;
  mode: Mode;
  open: boolean;
  initial: VcFundSnapshot | null;
  /** Pre-filled fields + confidence from AI extraction (add flow). */
  extractedData?: { extracted: SnapshotExtractedFields; confidence: SnapshotExtractionConfidence } | null;
  sourceObligationId?: string | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodQuarter, setPeriodQuarter] = useState(1);
  const [snapshotDate, setSnapshotDate] = useState('');
  const [nav, setNav] = useState('');
  const [committed, setCommitted] = useState('');
  const [distPeriod, setDistPeriod] = useState('');
  const [reportedIrrPct, setReportedIrrPct] = useState('');
  const [remark, setRemark] = useState('');
  const [frozenConfidence, setFrozenConfidence] = useState<SnapshotExtractionConfidence | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (mode === 'edit' && initial) {
      setFrozenConfidence(
        initial.extraction_confidence && typeof initial.extraction_confidence === 'object'
          ? (initial.extraction_confidence as SnapshotExtractionConfidence)
          : null,
      );
      setPeriodYear(initial.period_year);
      setPeriodQuarter(initial.period_quarter);
      setSnapshotDate(initial.snapshot_date);
      setNav(String(initial.nav));
      setCommitted(initial.committed_capital != null ? String(initial.committed_capital) : '');
      setDistPeriod(initial.distributions_in_period != null ? String(initial.distributions_in_period) : '');
      setReportedIrrPct(initial.reported_irr != null ? String(Number(initial.reported_irr) * 100) : '');
      setRemark(initial.investor_remark ?? '');
    } else {
      const y = new Date().getFullYear();
      const m = new Date().getMonth() + 1;
      const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
      if (extractedData?.extracted) {
        const ex = extractedData.extracted;
        setPeriodYear(ex.period_year);
        setPeriodQuarter(ex.period_quarter);
        setSnapshotDate(ex.snapshot_date);
        setNav(String(ex.nav));
        setCommitted(ex.committed_capital != null ? String(ex.committed_capital) : '');
        setDistPeriod(ex.distributions_in_period != null ? String(ex.distributions_in_period) : '');
        setReportedIrrPct(ex.reported_irr_pct != null ? String(ex.reported_irr_pct) : '');
        setRemark(ex.investor_remark ?? '');
        setFrozenConfidence(extractedData.confidence ?? {});
      } else {
        setPeriodYear(y);
        setPeriodQuarter(q);
        setSnapshotDate('');
        setNav('');
        setCommitted('');
        setDistPeriod('');
        setReportedIrrPct('');
        setRemark('');
        setFrozenConfidence(null);
      }
    }
  }, [open, mode, initial, extractedData]);

  if (!open) return null;

  const save = async () => {
    const navN = Number(nav);
    if (!snapshotDate.trim() || Number.isNaN(navN) || navN < 0) {
      setErr('Snapshot date and NAV are required.');
      return;
    }
    setBusy(true);
    setErr(null);
    const base = {
      id: mode === 'edit' && initial ? initial.id : undefined,
      period_year: periodYear,
      period_quarter: periodQuarter,
      snapshot_date: snapshotDate.trim(),
      nav: navN,
      committed_capital: committed.trim() ? Number(committed) : null,
      distributions_in_period: distPeriod.trim() ? Number(distPeriod) : null,
      reported_irr_pct: reportedIrrPct.trim() ? Number(reportedIrrPct) : null,
      investor_remark: remark.trim() || null,
    };
    const withSource =
      mode === 'add' && sourceObligationId
        ? {
            ...base,
            source_obligation_id: sourceObligationId,
            ...(frozenConfidence && Object.keys(frozenConfidence).length > 0
              ? { extraction_confidence: frozenConfidence as Record<string, unknown> }
              : {}),
          }
        : base;
    const res = await upsertFundSnapshotAction(fundId, withSource);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    onSaved(mode === 'add' ? 'Snapshot saved.' : 'Snapshot updated.');
    onClose();
  };

  const showAiBanner = mode === 'add' && !!extractedData;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold text-[#0B1F45]">{mode === 'add' ? 'Add performance snapshot' : 'Edit snapshot'}</h2>
        <p className="mt-1 text-xs text-gray-500">{quarterLabel(periodYear, periodQuarter)}</p>

        {showAiBanner ? (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
            Values below were suggested from the uploaded report. Review every field before saving; nothing is stored until you confirm.
          </div>
        ) : null}

        <ConfidenceStrip confidence={frozenConfidence} />

        {err ? <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
            <Input type="date" className="mt-1" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <Label>NAV (fund currency)</Label>
            <Input type="number" step="any" className="mt-1" value={nav} onChange={(e) => setNav(e.target.value)} required />
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

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
