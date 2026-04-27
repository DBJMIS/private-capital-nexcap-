'use client';

import { useCallback, useEffect, useState } from 'react';

import { SnapshotForm } from '@/components/portfolio/SnapshotForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTime, formatShortDate } from '@/lib/format-date';

type ProfileOption = { user_id: string; full_name: string; email: string };

type SnapshotRow = {
  id: string;
  snapshot_date: string;
  performance_score: number | null;
  repayment_status: string;
  revenue_usd: number | null;
  ebitda_usd: number | null;
  valuation_usd: number | null;
  notes: string | null;
};

type ReportRow = {
  id: string;
  reporting_period: string;
  report_type: string;
  document_path: string | null;
  created_at: string;
};

export function PortfolioMonitoringSection({
  investmentId,
  status,
  portfolioReviewerId,
  canWriteInvestments,
  onChanged,
}: {
  investmentId: string;
  status: string;
  portfolioReviewerId: string | null;
  canWriteInvestments: boolean;
  onChanged?: () => void;
}) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [reviewer, setReviewer] = useState(portfolioReviewerId ?? '');
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [busyReviewer, setBusyReviewer] = useState(false);
  const [busyReport, setBusyReport] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('');
  const [reportType, setReportType] = useState<'quarterly' | 'annual' | 'ad_hoc'>('quarterly');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const [pr, sn, rp] = await Promise.all([
      fetch('/api/profiles'),
      fetch(`/api/investments/${investmentId}/snapshots`),
      fetch(`/api/investments/${investmentId}/reports`),
    ]);
    const pj = (await pr.json()) as { profiles?: ProfileOption[]; error?: string };
    const sj = (await sn.json()) as { snapshots?: SnapshotRow[]; error?: string };
    const rj = (await rp.json()) as { reports?: ReportRow[]; error?: string };
    if (pr.ok) setProfiles(pj.profiles ?? []);
    if (sn.ok) setSnapshots(sj.snapshots ?? []);
    if (rp.ok) setReports(rj.reports ?? []);
    if (!pr.ok || !sn.ok || !rp.ok) {
      setErr(pj.error ?? sj.error ?? rj.error ?? 'Failed to load monitoring data');
    }
  }, [investmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setReviewer(portfolioReviewerId ?? '');
  }, [portfolioReviewerId]);

  const saveReviewer = async () => {
    if (!canWriteInvestments) return;
    setBusyReviewer(true);
    setErr(null);
    try {
      const res = await fetch(`/api/investments/${investmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio_reviewer_id: reviewer === '' ? null : reviewer }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Update failed');
        return;
      }
      onChanged?.();
    } finally {
      setBusyReviewer(false);
    }
  };

  const uploadReport = async (file: File) => {
    if (!canWriteInvestments) return;
    if (!reportPeriod.trim()) {
      setErr('Enter a reporting period label (e.g. Q1 2026).');
      return;
    }
    setBusyReport(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('reporting_period', reportPeriod.trim());
      fd.set('report_type', reportType);
      const res = await fetch(`/api/investments/${investmentId}/reports`, { method: 'POST', body: fd });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Upload failed');
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setBusyReport(false);
    }
  };

  const active = status === 'active';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-navy">Portfolio monitoring</h2>
      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{err}</div>}

      <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell">
        <h3 className="text-sm font-semibold text-navy">Reviewer</h3>
        <p className="mt-1 text-xs text-navy/55">Assign who is responsible for monitoring this investment.</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grow space-y-1">
            <Label htmlFor="reviewer">Team member</Label>
            <select
              id="reviewer"
              className="flex h-10 w-full rounded-md border border-shell-border bg-white px-3 py-2 text-sm text-navy"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              disabled={!canWriteInvestments || busyReviewer}
            >
              <option value="">— Unassigned —</option>
              {profiles.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name} ({p.email})
                </option>
              ))}
            </select>
          </div>
          {canWriteInvestments && (
            <Button
              type="button"
              variant="outline"
              disabled={busyReviewer}
              onClick={() => void saveReviewer()}
            >
              {busyReviewer ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {canWriteInvestments && active && (
        <SnapshotForm
          investmentId={investmentId}
          onSaved={() => {
            void load();
            onChanged?.();
          }}
        />
      )}

      <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell">
        <h3 className="text-sm font-semibold text-navy">Recent snapshots</h3>
        <ul className="mt-3 space-y-2 text-sm text-navy/85">
          {snapshots.length === 0 ? (
            <li className="text-navy/50">No snapshots yet.</li>
          ) : (
            snapshots.slice(0, 8).map((s) => (
              <li key={s.id} className="flex flex-wrap gap-x-3 border-b border-shell-border/70 pb-2 last:border-0">
                <span className="font-medium">{formatShortDate(s.snapshot_date)}</span>
                <span className="tabular-nums">Score {s.performance_score != null ? s.performance_score : '—'}</span>
                <span className="text-navy/70">{s.repayment_status}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell">
        <h3 className="text-sm font-semibold text-navy">Monitoring reports (PDF / DOCX)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="rep_period">Reporting period</Label>
            <Input
              id="rep_period"
              value={reportPeriod}
              onChange={(e) => setReportPeriod(e.target.value)}
              placeholder="e.g. Q1 2026"
              disabled={!canWriteInvestments || !active || busyReport}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rep_type">Type</Label>
            <select
              id="rep_type"
              className="flex h-10 w-full rounded-md border border-shell-border bg-white px-3 py-2 text-sm text-navy"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as typeof reportType)}
              disabled={!canWriteInvestments || !active || busyReport}
            >
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="ad_hoc">Ad hoc</option>
            </select>
          </div>
          <div className="flex items-end">
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="block w-full text-xs text-navy file:mr-2 file:rounded file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:text-navy-foreground"
              disabled={!canWriteInvestments || !active || busyReport}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void uploadReport(f);
              }}
            />
          </div>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {reports.length === 0 ? (
            <li className="text-navy/50">No reports uploaded.</li>
          ) : (
            reports.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-shell-border/70 pb-2 last:border-0">
                <span className="font-medium text-navy">
                  {r.reporting_period} · {r.report_type}
                </span>
                <span className="text-xs text-navy/50">{formatDateTime(r.created_at)}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
