'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  XCircle,
} from 'lucide-react';

import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { dsCard, dsField } from '@/components/ui/design-system';
import { formatDateTime } from '@/lib/format-date';
import { PANEL_SCORING_GROUPS } from '@/lib/applications/panel-scoring';
import { cn } from '@/lib/utils';

type Decision = 'full_dd' | 'conditional_dd' | 'no_dd';

type CombinedAi = {
  recommendation: Decision;
  confidence: 'high' | 'medium' | 'low';
  weighted_score: number;
  summary: string;
  strong_points: string[];
  weak_points: string[];
  conditions: string | null;
  reasoning: string;
  category_highlights: { strongest: string; weakest: string };
};

type ExistingDecision = {
  decision: Decision;
  strong_points: string | null;
  weak_points: string | null;
  conditions: string | null;
  rejection_reason: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_overrides_ai: boolean;
};

function parseCombinedAi(raw: unknown): CombinedAi | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const rec = o.recommendation;
  if (rec !== 'full_dd' && rec !== 'conditional_dd' && rec !== 'no_dd') return null;
  const conf = o.confidence;
  if (conf !== 'high' && conf !== 'medium' && conf !== 'low') return null;
  const ws = typeof o.weighted_score === 'number' ? o.weighted_score : Number(o.weighted_score);
  if (!Number.isFinite(ws)) return null;
  const summary = typeof o.summary === 'string' ? o.summary : '';
  const reasoning = typeof o.reasoning === 'string' ? o.reasoning : '';
  const strong_points = Array.isArray(o.strong_points) ? o.strong_points.map((x) => String(x)) : [];
  const weak_points = Array.isArray(o.weak_points) ? o.weak_points.map((x) => String(x)) : [];
  const conditions =
    o.conditions === null || o.conditions === undefined
      ? null
      : typeof o.conditions === 'string'
        ? o.conditions
        : String(o.conditions);
  const ch = o.category_highlights;
  let strongest = '';
  let weakest = '';
  if (ch && typeof ch === 'object' && !Array.isArray(ch)) {
    const h = ch as Record<string, unknown>;
    strongest = typeof h.strongest === 'string' ? h.strongest : '';
    weakest = typeof h.weakest === 'string' ? h.weakest : '';
  }
  return {
    recommendation: rec,
    confidence: conf,
    weighted_score: ws,
    summary,
    strong_points,
    weak_points,
    conditions,
    reasoning,
    category_highlights: { strongest, weakest },
  };
}

function barColor(avg: number): string {
  if (avg >= 3.5) return 'bg-teal-500';
  if (avg >= 2.5) return 'bg-amber-400';
  return 'bg-red-400';
}

function decisionDisplayLabel(d: Decision): string {
  if (d === 'full_dd') return 'Full Due Diligence';
  if (d === 'conditional_dd') return 'Conditional Due Diligence';
  return 'No Due Diligence';
}

export function DdDecisionTab({ applicationId, fundName }: { applicationId: string; fundName: string }) {
  const router = useRouter();
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [voteTotals, setVoteTotals] = useState({ full_dd: 0, conditional_dd: 0, no_dd: 0 });
  const [categoryAverages, setCategoryAverages] = useState<Record<string, number>>({});
  const [overallAverage, setOverallAverage] = useState(0);
  const [panelCount, setPanelCount] = useState(0);
  const [existing, setExisting] = useState<ExistingDecision | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [strongPoints, setStrongPoints] = useState('');
  const [weakPoints, setWeakPoints] = useState('');
  const [conditions, setConditions] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [combinedAi, setCombinedAi] = useState<CombinedAi | null>(null);
  const [aiApplied, setAiApplied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null);
  const recommendStarted = useRef(false);

  const decisionLocked = Boolean(existing?.decided_at);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/dd-decision`, { cache: 'no-store' });
      const j = (await res.json()) as {
        data: {
          fund_name: string;
          panel_evaluation_count: number;
          vote_totals: typeof voteTotals;
          criteria_aggregates: unknown[];
          category_averages: Record<string, number>;
          overall_average: number;
          existing_decision: ExistingDecision | null;
          questionnaire_id: string | null;
          ai_recommendation: unknown;
        } | null;
        error: string | null;
      };
      if (!res.ok || !j.data) {
        setErr(j.error ?? 'Failed to load DD decision data');
        return;
      }
      setQuestionnaireId(j.data.questionnaire_id ?? null);
      setVoteTotals(j.data.vote_totals);
      setCategoryAverages(j.data.category_averages);
      setOverallAverage(j.data.overall_average);
      setPanelCount(j.data.panel_evaluation_count);
      setExisting(j.data.existing_decision);
      const parsedAi = parseCombinedAi(j.data.ai_recommendation);
      setCombinedAi(parsedAi);
      setAiApplied(false);
      if (j.data.existing_decision) {
        setDecision(j.data.existing_decision.decision);
        setStrongPoints(j.data.existing_decision.strong_points ?? '');
        setWeakPoints(j.data.existing_decision.weak_points ?? '');
        setConditions(j.data.existing_decision.conditions ?? '');
        setRejectionReason(j.data.existing_decision.rejection_reason ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ensureRecommend = useCallback(async () => {
    if (recommendStarted.current) return;
    recommendStarted.current = true;
    setAiBusy(true);
    setAiErr(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/dd-decision/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = (await res.json()) as {
        data: { recommendation: unknown } | null;
        error: string | null;
      };
      if (!res.ok || !j.data) {
        setAiErr(j.error ?? 'Failed to generate AI recommendation');
        recommendStarted.current = false;
        return;
      }
      const parsed = parseCombinedAi(j.data.recommendation);
      if (!parsed) {
        setAiErr('Invalid AI response');
        recommendStarted.current = false;
        return;
      }
      setCombinedAi(parsed);
    } finally {
      setAiBusy(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (loading) return;
    if (combinedAi) return;
    void ensureRecommend();
  }, [loading, combinedAi, ensureRecommend]);

  const applyAiToForm = () => {
    if (!combinedAi) return;
    setDecision(combinedAi.recommendation);
    setStrongPoints(combinedAi.strong_points.join('\n'));
    setWeakPoints(combinedAi.weak_points.join('\n'));
    if (combinedAi.recommendation === 'conditional_dd' && combinedAi.conditions) {
      setConditions(combinedAi.conditions);
    }
    setAiApplied(true);
  };

  const confirmVariant = useMemo(() => {
    if (decision === 'full_dd') return 'success' as const;
    if (decision === 'conditional_dd') return 'warning' as const;
    return 'danger' as const;
  }, [decision]);

  const confirmCopy = useMemo(() => {
    if (decision === 'full_dd') {
      return {
        title: 'Confirm Full Due Diligence',
        message: `Proceed to full due diligence for ${fundName}? A DD questionnaire will be created if one does not exist.`,
        confirmLabel: 'Confirm',
      };
    }
    if (decision === 'conditional_dd') {
      return {
        title: 'Confirm Conditional Due Diligence',
        message: `Proceed with conditional due diligence for ${fundName}? Ensure conditions are documented.`,
        confirmLabel: 'Confirm',
      };
    }
    return {
      title: 'Reject application',
      message: `Mark ${fundName} as rejected (no due diligence)? This updates the application status.`,
      confirmLabel: 'Reject',
    };
  }, [decision, fundName]);

  const submitDecision = async () => {
    if (!decision) {
      setErr('Please select a decision to proceed.');
      setConfirmOpen(false);
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/dd-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          strong_points: strongPoints,
          weak_points: weakPoints,
          conditions,
          rejection_reason: rejectionReason,
        }),
      });

      const raw = await res.text();
      let body: {
        ok?: boolean;
        data?: {
          questionnaire_id?: string | null;
          application_status?: string;
          dd_decision?: { decided_at?: string; decider_name?: string | null };
        };
        error?: string | null;
      } = {};
      try {
        if (raw.trim()) body = JSON.parse(raw) as typeof body;
      } catch {
        throw new Error('Invalid response from server');
      }

      if (!res.ok) {
        const msg =
          typeof body.error === 'string' && body.error.trim()
            ? body.error
            : `Request failed with status ${res.status}`;
        throw new Error(msg);
      }

      const qid = body.data?.questionnaire_id ?? null;
      if (qid) setQuestionnaireId(qid);

      await load();
      router.refresh();
    } catch (e) {
      console.error('[DDDecision] confirm failed:', e);
      setErr(e instanceof Error ? e.message : 'Failed to confirm decision');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div className={cn(dsCard.padded, 'flex items-center gap-3 text-sm text-gray-600')}>
        <Loader2 className="h-5 w-5 animate-spin text-[#0B1F45]" aria-hidden />
        Loading DD decision…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-6 lg:max-w-[65%]">
        {existing?.decided_at ? (
          <section className="rounded-xl border border-teal-200 bg-teal-50 p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" aria-hidden />
            <h3 className="mt-3 text-lg font-semibold text-teal-800">Decision Confirmed</h3>
            <p className="mt-1 text-base font-semibold text-[#0B1F45]">{decisionDisplayLabel(existing.decision)}</p>
            <p className="mt-2 text-sm text-gray-600">
              Decided by {existing.decided_by?.trim() || '—'} on {formatDateTime(existing.decided_at)}
            </p>
            {existing.decision_overrides_ai ? (
              <p className="mt-2 text-xs font-medium text-amber-700">This decision overrides the AI recommendation.</p>
            ) : null}
            {(existing.decision === 'full_dd' || existing.decision === 'conditional_dd') && questionnaireId ? (
              <div className="mt-4 border-t border-teal-200/80 pt-4">
                <p className="text-sm font-medium text-teal-800">DD questionnaire is ready.</p>
                <Link
                  href={`/questionnaires/${questionnaireId}`}
                  className="mt-2 inline-flex text-sm font-semibold text-[#0B1F45] underline decoration-teal-600 underline-offset-2 hover:text-teal-800"
                >
                  View DD Questionnaire →
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}

        {err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">⚠ {err}</div>
        ) : null}

        <section className={cn(dsCard.padded, 'space-y-5')}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Panel Vote Summary</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-center">
              <p className="text-3xl font-bold text-teal-700">{voteTotals.full_dd}</p>
              <p className="mt-1 text-xs text-gray-500">Full Due Diligence</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-3xl font-bold text-amber-700">{voteTotals.conditional_dd}</p>
              <p className="mt-1 text-xs text-gray-500">Conditional DD</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-3xl font-bold text-red-700">{voteTotals.no_dd}</p>
              <p className="mt-1 text-xs text-gray-500">No Due Diligence</p>
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Category performance</h4>
            <div className="space-y-3">
              {PANEL_SCORING_GROUPS.map((g) => {
                const avg = categoryAverages[g.category] ?? 0;
                const pct = Math.min(100, Math.max(0, (avg / 4) * 100));
                return (
                  <div key={g.category} className="grid grid-cols-[1fr_6rem_3.5rem] items-center gap-2 text-sm">
                    <span className="truncate font-medium text-gray-800">{g.category}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className={cn('h-full rounded-full transition-all', barColor(avg))} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-right tabular-nums text-gray-600">
                      {avg.toFixed(1)}/4
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500">Overall combined average: {overallAverage.toFixed(2)}/4 · {panelCount} panel evaluation(s)</p>
          </div>
        </section>

        <section className={cn(dsCard.padded, 'space-y-4', decisionLocked && 'pointer-events-none opacity-60')}>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Decision Notes</h3>
            <p className="mt-1 text-xs text-gray-500">Document the key factors in this decision</p>
          </div>
          <label className={labelClass}>
            Strong points
            <textarea
              className={cn('mt-1', dsField.textarea)}
              rows={4}
              placeholder="Summarise the fund's key strengths as identified by the panel…"
              value={strongPoints}
              onChange={(e) => setStrongPoints(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Areas of concern
            <textarea
              className={cn('mt-1', dsField.textarea)}
              rows={3}
              placeholder="Note any weaknesses or concerns…"
              value={weakPoints}
              onChange={(e) => setWeakPoints(e.target.value)}
            />
          </label>
          {decision === 'conditional_dd' ? (
            <label className={labelClass}>
              Conditions
              <textarea
                className={cn('mt-1', dsField.textarea)}
                rows={3}
                placeholder="Specific conditions the fund must satisfy before due diligence proceeds…"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
              />
            </label>
          ) : null}
          {decision === 'no_dd' ? (
            <label className={labelClass}>
              Rejection reason
              <textarea
                className={cn('mt-1', dsField.textarea)}
                rows={3}
                placeholder="Explain why the fund does not meet the requirements for due diligence…"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </label>
          ) : null}
        </section>

        <section className={cn(dsCard.padded, 'space-y-4', decisionLocked && 'pointer-events-none opacity-60')}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">DBJ Final Decision</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <FinalDecisionCard
              tone="teal"
              selected={decision === 'full_dd'}
              icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
              title="Full Due Diligence"
              subtitle="Proceed to full DD"
              aiMatch={combinedAi?.recommendation === 'full_dd'}
              onClick={() => {
                if (decisionLocked) return;
                setErr(null);
                setDecision('full_dd');
              }}
            />
            <FinalDecisionCard
              tone="amber"
              selected={decision === 'conditional_dd'}
              icon={<AlertTriangle className="h-8 w-8" aria-hidden />}
              title="Conditional Due Diligence"
              subtitle="Proceed with conditions"
              aiMatch={combinedAi?.recommendation === 'conditional_dd'}
              onClick={() => {
                if (decisionLocked) return;
                setErr(null);
                setDecision('conditional_dd');
              }}
            />
            <FinalDecisionCard
              tone="red"
              selected={decision === 'no_dd'}
              icon={<XCircle className="h-8 w-8" aria-hidden />}
              title="No Due Diligence"
              subtitle="Application not advanced"
              aiMatch={combinedAi?.recommendation === 'no_dd'}
              onClick={() => {
                if (decisionLocked) return;
                setErr(null);
                setDecision('no_dd');
              }}
            />
          </div>

          <button
            type="button"
            disabled={!decision || busy || decisionLocked}
            onClick={() => {
              setErr(null);
              if (!decision) {
                setErr('Please select a decision to proceed.');
                return;
              }
              setConfirmOpen(true);
            }}
            className={cn(
              'w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors disabled:pointer-events-none disabled:opacity-50',
              decision === 'full_dd' && 'bg-teal-500 hover:bg-teal-600',
              decision === 'conditional_dd' && 'bg-amber-500 hover:bg-amber-600',
              decision === 'no_dd' && 'bg-red-500 hover:bg-red-600',
              !decision && 'bg-gray-300',
            )}
          >
            {decision === 'full_dd' ? '✓ Confirm — Proceed to Due Diligence' : null}
            {decision === 'conditional_dd' ? '✓ Confirm — Conditional Due Diligence' : null}
            {decision === 'no_dd' ? '✗ Confirm — Reject Application' : null}
            {!decision ? 'Select a decision' : null}
          </button>

        </section>
      </div>

      <div className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[35%] lg:min-w-[280px]">
        <section
          className={cn(
            dsCard.padded,
            'border-indigo-200 bg-gradient-to-b from-indigo-50/80 to-white shadow-sm',
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
            <span className="text-sm font-semibold text-indigo-700">AI Recommendation</span>
          </div>

          {(aiBusy || (!combinedAi && !aiErr)) && (
            <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-white/80 p-4">
              <div
                className="h-5 w-5 shrink-0 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-indigo-700">Analysing panel scores…</p>
                <p className="mt-0.5 text-xs text-indigo-400">Combined panel assessment</p>
              </div>
            </div>
          )}

          {aiErr && !aiBusy ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {aiErr}{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => {
                  recommendStarted.current = false;
                  setAiErr(null);
                  void ensureRecommend();
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          {combinedAi && !aiBusy ? (
            <div className="space-y-3">
              {combinedAi.recommendation === 'full_dd' ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-center">
                  <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-teal-600" aria-hidden />
                  <p className="font-bold text-teal-700">Full Due Diligence</p>
                </div>
              ) : combinedAi.recommendation === 'conditional_dd' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="font-bold text-amber-700">Conditional Due Diligence</p>
                </div>
              ) : (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                  <p className="font-bold text-red-700">No Due Diligence</p>
                </div>
              )}

              <p className="text-center text-sm font-semibold text-gray-800">
                Combined score: {combinedAi.weighted_score.toFixed(1)}/4
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs text-gray-500">Confidence:</span>
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-medium',
                    combinedAi.confidence === 'high' && 'bg-teal-100 text-teal-700',
                    combinedAi.confidence === 'medium' && 'bg-amber-100 text-amber-700',
                    combinedAi.confidence === 'low' && 'bg-red-100 text-red-700',
                  )}
                >
                  {combinedAi.confidence.charAt(0).toUpperCase() + combinedAi.confidence.slice(1)}
                </span>
              </div>

              {combinedAi.summary ? (
                <p className="text-sm italic leading-relaxed text-gray-600">{combinedAi.summary}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {combinedAi.category_highlights.strongest ? (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                    Strongest: {combinedAi.category_highlights.strongest}
                  </span>
                ) : null}
                {combinedAi.category_highlights.weakest ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Weakest: {combinedAi.category_highlights.weakest}
                  </span>
                ) : null}
              </div>

              {combinedAi.strong_points.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">Strong points</p>
                  <ul className="space-y-1.5">
                    {combinedAi.strong_points.map((s, i) => (
                      <li key={`sp-${i}`} className="flex items-start gap-1.5 text-sm text-gray-600">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" aria-hidden />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {combinedAi.weak_points.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Weak points</p>
                  <ul className="space-y-1.5">
                    {combinedAi.weak_points.map((s, i) => (
                      <li key={`wp-${i}`} className="flex items-start gap-1.5 text-sm text-gray-600">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {combinedAi.recommendation === 'conditional_dd' && combinedAi.conditions ? (
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="mb-1 text-xs font-semibold text-amber-700">Suggested conditions</p>
                  <p className="text-sm text-amber-900">{combinedAi.conditions}</p>
                </div>
              ) : null}

              {combinedAi.reasoning ? (
                <p className="text-xs leading-relaxed text-gray-600">{combinedAi.reasoning}</p>
              ) : null}

              <button
                type="button"
                className={cn(
                  'w-full rounded-lg border border-indigo-200 py-2 text-sm font-medium transition-colors',
                  aiApplied ? 'cursor-default text-teal-600' : 'text-indigo-600 hover:bg-indigo-50',
                )}
                disabled={aiApplied}
                onClick={applyAiToForm}
              >
                {aiApplied ? '✓ Applied to decision' : 'Apply to decision'}
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onCancel={() => {
          setConfirmOpen(false);
        }}
        onConfirm={() => void submitDecision()}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        loadingConfirmLabel="Confirming…"
        confirmVariant={confirmVariant}
        isLoading={busy}
      />
    </div>
  );
}

function FinalDecisionCard({
  tone,
  selected,
  icon,
  title,
  subtitle,
  aiMatch,
  onClick,
}: {
  tone: 'teal' | 'amber' | 'red';
  selected: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  aiMatch: boolean;
  onClick: () => void;
}) {
  const base = 'relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors';
  const unselected = 'border-gray-200 bg-white text-gray-400 hover:border-gray-300';
  const selectedCls =
    tone === 'teal'
      ? 'border-teal-500 bg-teal-50 text-teal-700'
      : tone === 'amber'
        ? 'border-amber-500 bg-amber-50 text-amber-700'
        : 'border-red-500 bg-red-50 text-red-700';

  return (
    <button type="button" className={cn(base, selected ? selectedCls : unselected)} onClick={onClick}>
      {aiMatch ? (
        <span className="absolute right-2 top-2 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
          AI recommended
        </span>
      ) : null}
      <span className={selected ? '' : 'text-gray-400'}>{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-gray-500">{subtitle}</span>
    </button>
  );
}
