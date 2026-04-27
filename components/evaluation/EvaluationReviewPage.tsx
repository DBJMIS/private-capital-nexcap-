'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format-date';
import { CATEGORY_TITLES, PRE_SCREENING_CATEGORY_ORDER } from '@/lib/pre-screening/catalog';
import type { PreScreeningCategory } from '@/lib/pre-screening/catalog';

type Props = { applicationId: string };

type CriterionRow = {
  id: string;
  criteria_key: string;
  criteria_weight: number;
  max_points: number;
  raw_score: number | null;
  weighted_score: number | null;
  ai_reasoning: string | null;
  override_score: number | null;
  override_reason: string | null;
};

export function EvaluationReviewPage({ applicationId }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'accept' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/applications/${applicationId}/evaluation-review`);
    const j = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      setErr((j.error as string) ?? 'Failed to load');
      setData(null);
      return;
    }
    setData(j);
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitDecision = async (decision: 'accept' | 'reject') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/staff-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: notes.trim() }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Request failed');
      setModal(null);
      setNotes('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const applyOverride = async (c: CriterionRow, score: number, reason: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/criteria-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria_id: c.id, override_score: score, override_reason: reason }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Override failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (err && !data) {
    return <p className="text-sm text-red-700">{err}</p>;
  }
  if (!data) return <p className="text-sm text-navy/60">Loading…</p>;

  const app = data.application as { fund_name: string; status: string; submitted_at: string | null };
  const assessment = data.assessment as { overall_score: number | null; passed: boolean | null } | null;
  const criteria = (data.criteria as CriterionRow[]) ?? [];
  const overall = assessment?.overall_score != null ? Number(assessment.overall_score) : 0;
  const canAccept = overall >= 70 && assessment?.passed === true;

  return (
    <div className="w-full max-w-none space-y-6">
      {err && <p className="text-sm text-red-700">{err}</p>}

      <header className="app-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label text-teal">Evaluation</p>
            <h2 className="mt-1 text-[18px] font-semibold text-navy">{app.fund_name}</h2>
            <p className="mt-1 text-[12px] text-[#9ca3af]">
              Submitted: {app.submitted_at ? formatDateTime(app.submitted_at) : '—'} · Status:{' '}
              <span className="font-medium">{app.status}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full border-4 text-2xl font-bold ${
                overall >= 70 ? 'border-teal text-teal' : 'border-red-700 text-red-700'
              }`}
            >
              {overall.toFixed(0)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!canAccept || busy} onClick={() => setModal('accept')}>
                Accept fund
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={() => setModal('reject')}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-[18px] font-semibold text-navy">Scoring breakdown</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {criteria.map((c) => {
            const raw = c.override_score ?? c.raw_score ?? 0;
            const border =
              raw >= 4 ? 'border-teal/60' : raw === 3 ? 'border-amber-400' : raw <= 2 ? 'border-red-600' : 'border-shell-border';
            const w = Number(c.criteria_weight);
            const contrib = c.weighted_score != null ? Number(c.weighted_score) : 0;
            const open = expanded[c.id] ?? false;
            return (
              <div key={c.id} className={`rounded-lg border bg-white p-4 ${border}`}>
                <p className="text-sm font-semibold text-navy">
                  {String(c.criteria_key).toUpperCase()} — {w}%
                </p>
                <p className="mt-1 text-xs text-navy/60">
                  AI score: {c.raw_score ?? '—'}/5 · Contribution: {contrib.toFixed(1)} / {w.toFixed(1)} pts
                </p>
                <p className="mt-2 text-sm text-navy/80">{c.ai_reasoning ?? '—'}</p>
                <button
                  type="button"
                  className="mt-3 text-xs font-medium text-teal underline"
                  onClick={() => setExpanded((s) => ({ ...s, [c.id]: !open }))}
                >
                  {open ? 'Hide override' : 'Override score'}
                </button>
                {open ? (
                  <OverrideForm criterion={c} disabled={busy} onApply={(s, r) => void applyOverride(c, s, r)} />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <PreScreenCollapsible data={data} />
      <AnswersCollapsible data={data} />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[#e5e7eb] bg-white p-6">
            <h3 className="text-[18px] font-semibold text-navy">{modal === 'accept' ? 'Accept fund' : 'Reject fund'}</h3>
            <textarea
              className="mt-3 w-full rounded-md border border-[#e5e7eb] p-2 text-[13px] text-[#374151] placeholder:text-[#9ca3af] focus:border-teal focus:outline-none focus:ring-2 focus:ring-[rgba(15,138,110,0.1)]"
              rows={4}
              placeholder="Notes (required)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={modal === 'accept' ? 'default' : 'destructive'}
                disabled={busy || !notes.trim()}
                onClick={() => void submitDecision(modal)}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverrideForm({
  criterion,
  disabled,
  onApply,
}: {
  criterion: CriterionRow;
  disabled: boolean;
  onApply: (score: number, reason: string) => void;
}) {
  const [score, setScore] = useState(String(criterion.override_score ?? criterion.raw_score ?? 3));
  const [reason, setReason] = useState(criterion.override_reason ?? '');
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-shell-bg/80 p-3">
      <label className="text-xs font-medium text-navy">Override score (1–5)</label>
      <input
        className="w-full rounded border border-shell-border px-2 py-1 text-sm"
        value={score}
        onChange={(e) => setScore(e.target.value)}
      />
      <label className="text-xs font-medium text-navy">Reason</label>
      <textarea
        className="w-full rounded border border-shell-border px-2 py-1 text-sm"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        className="mt-1 bg-navy text-navy-foreground"
        disabled={disabled}
        onClick={() => onApply(Number(score), reason)}
      >
        Apply override
      </Button>
    </div>
  );
}

function PreScreenCollapsible({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const pre = data.pre_screening as {
    checklist: Record<string, unknown>;
    items: Array<{ category: string; item_key: string; label: string; status: string }>;
  } | null;
  if (!pre?.items?.length) return null;
  const grouped = new Map<string, typeof pre.items>();
  for (const it of pre.items) {
    const arr = grouped.get(it.category) ?? [];
    arr.push(it);
    grouped.set(it.category, arr);
  }
  return (
    <section className="app-card p-4">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span className="text-[13px] font-semibold text-navy">Pre-screening summary (auto)</span>
        <span className="text-[12px] text-[#9ca3af]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4 text-sm">
          {PRE_SCREENING_CATEGORY_ORDER.map((cat: PreScreeningCategory) => (
            <div key={cat}>
              <p className="text-xs font-semibold uppercase text-gold">{CATEGORY_TITLES[cat]}</p>
              <ul className="mt-2 space-y-1">
                {(grouped.get(cat) ?? []).map((i) => (
                  <li key={i.item_key} className="flex justify-between gap-2 text-navy/80">
                    <span>{i.label}</span>
                    <span className="font-mono text-xs">{i.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AnswersCollapsible({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const snap = data.questionnaire_snapshot;
  if (!snap || typeof snap !== 'object') return null;
  return (
    <section className="app-card p-4">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span className="text-[13px] font-semibold text-navy">Questionnaire answers</span>
        <span className="text-[12px] text-[#9ca3af]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <pre className="mt-4 max-h-[480px] overflow-auto rounded-lg bg-shell-bg/80 p-3 text-xs text-navy/80">
          {JSON.stringify(snap, null, 2)}
        </pre>
      )}
    </section>
  );
}
