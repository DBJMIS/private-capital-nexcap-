'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Sparkles, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ASSESSMENT_CRITERIA, CRITERIA_ORDER, PASS_THRESHOLD, type CriteriaKey } from '@/lib/scoring/config';
import type { AssessmentCriteriaProgressRow, VcAssessmentSummary } from '@/lib/applications/assessment-workspace';
import { formatShortDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

function criteriaTitle(key: string): string {
  const k = key as CriteriaKey;
  return ASSESSMENT_CRITERIA.find((c) => c.key === k)?.title ?? key;
}

function criteriaMaxPoints(key: CriteriaKey): number {
  return ASSESSMENT_CRITERIA.find((c) => c.key === key)?.weightPercent ?? 0;
}

function outcomeBand(score: number): { color: string; label: string } {
  if (score >= 85) return { color: 'text-[#0F8A6E]', label: 'Strong — Recommend Approve' };
  if (score >= 70) return { color: 'text-blue-600', label: 'Adequate — Approve with Conditions' };
  if (score >= 55) return { color: 'text-amber-600', label: 'Weak — Request Additional Info' };
  return { color: 'text-red-600', label: 'Insufficient — Recommend Reject' };
}

function headerAssessmentTone(status: string | null | undefined): 'draft' | 'progress' | 'done' {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'completed' || s === 'approved') return 'done';
  if (s === 'draft' || !s) return 'draft';
  return 'progress';
}

function HeaderStatusPill({ tone }: { tone: 'draft' | 'progress' | 'done' }) {
  if (tone === 'draft') {
    return (
      <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70">Draft</span>
    );
  }
  if (tone === 'progress') {
    return (
      <span className="inline-flex rounded-full bg-amber-400/20 px-3 py-1 text-xs font-medium text-amber-200">
        In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-teal-400/20 px-3 py-1 text-xs font-medium text-teal-200">
      Completed
    </span>
  );
}

function AssessmentMainShell({
  fundName,
  assessmentStatus,
  children,
}: {
  fundName: string;
  assessmentStatus: string | null | undefined;
  children: ReactNode;
}) {
  const tone = headerAssessmentTone(assessmentStatus);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="bg-[#0B1F45] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/60">
              DD Questionnaire Assessment
            </p>
            <p className="text-lg font-bold text-white">{fundName}</p>
          </div>
          <div className="text-right">
            <div className="flex justify-end">
              <HeaderStatusPill tone={tone} />
            </div>
            <p className="mt-1 text-xs text-white/40">Linked to DD Questionnaire</p>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function FinalOptionCard({
  tone,
  selected,
  icon,
  title,
  subtitle,
  onClick,
}: {
  tone: 'teal' | 'amber' | 'red';
  selected: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  const base =
    'relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors';
  const unselected = 'border-gray-200 bg-white text-gray-500 hover:border-gray-300';
  const selectedCls =
    tone === 'teal'
      ? 'border-teal-500 bg-teal-50 text-teal-800'
      : tone === 'amber'
        ? 'border-amber-500 bg-amber-50 text-amber-900'
        : 'border-red-500 bg-red-50 text-red-800';

  return (
    <button type="button" className={cn(base, selected ? selectedCls : unselected)} onClick={onClick}>
      <span className={selected ? '' : 'text-gray-400'}>{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-gray-500">{subtitle}</span>
    </button>
  );
}

export function AssessmentTab({
  applicationId,
  applicationStatus,
  fundName,
  questionnaireId,
  questionnaireCompleted,
  assessment,
  criteriaProgress,
  canWrite,
}: {
  applicationId: string;
  applicationStatus: string;
  fundName: string;
  questionnaireId: string | null;
  questionnaireCompleted: boolean;
  assessment: VcAssessmentSummary | null;
  criteriaProgress: AssessmentCriteriaProgressRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [finalChoice, setFinalChoice] = useState<'approve' | 'approve_conditions' | 'reject' | null>(null);

  const displayFund = fundName.trim() || 'Fund application';

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const startAssessment = async () => {
    if (!questionnaireId) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId, questionnaire_id: questionnaireId }),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Failed to create assessment');
        return;
      }
      if (j.id) router.push(`/assessments/${j.id}`);
    } finally {
      setBusy(false);
    }
  };

  const postFinal = async (action: 'approve' | 'reject') => {
    setErr(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/final-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          rejection_reason: action === 'reject' ? rejectReason.trim() : undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setErr(j.error ?? 'Request failed');
        return;
      }
      setSuccess(action === 'approve' ? 'Application approved and marked as committed.' : 'Application rejected.');
      setRejectReason('');
      setFinalChoice(null);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const critByKey = useMemo(() => new Map(criteriaProgress.map((r) => [r.criteria_key, r.weighted_score])), [criteriaProgress]);

  const st = applicationStatus.trim().toLowerCase();
  const isCommitted = st === 'committed' || st === 'approved';
  const isRejected = st === 'rejected';

  if (!questionnaireCompleted && !assessment) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-500" aria-hidden />
        <p className="text-sm font-medium text-amber-700">DD Questionnaire not yet complete</p>
        <p className="mt-1 text-xs text-amber-600">
          The fund manager must complete all 9 sections of the DD questionnaire before assessment can begin.
        </p>
      </div>
    );
  }

  if (!assessment) {
    return (
      <AssessmentMainShell fundName={displayFund} assessmentStatus="draft">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-5">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-4xl font-bold text-gray-300">
                —<span className="text-lg font-semibold text-gray-300">/ 100</span>
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">Overall Score</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-gray-400">Pass threshold</p>
              <p className="text-sm font-semibold text-gray-600">
                {PASS_THRESHOLD} / 100
              </p>
              <div className="mt-2 h-2 w-32 rounded-full bg-gray-200" />
            </div>
            <div>
              <span className="inline-flex rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
                Not Yet Assessed
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Criteria Progress</p>
          <ul className="mt-4 grid grid-cols-1 gap-0">
            {CRITERIA_ORDER.map((key) => {
              const max = criteriaMaxPoints(key);
              return (
                <li
                  key={key}
                  className="flex items-center gap-3 border-b border-gray-100 py-2.5 last:border-0"
                >
                  <span className="w-12 shrink-0 rounded-md bg-[#0B1F45]/8 py-1 text-center text-xs font-bold text-[#0B1F45]">
                    {max}%
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700">{criteriaTitle(key)}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                      <div className="h-full w-0 rounded-full bg-gray-200" />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-300">
                    — / {max}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 bg-gray-50 px-6 py-5">
          <p className="flex max-w-xl items-start gap-2 text-sm text-gray-500">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" aria-hidden />
            <span>AI will analyse the DD questionnaire and suggest scores with evidence</span>
          </p>
          {canWrite ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B1F45] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#162d5e] disabled:opacity-60"
              disabled={busy || !questionnaireId}
              onClick={() => void startAssessment()}
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {busy ? 'Starting…' : 'Start AI-Powered Assessment →'}
            </button>
          ) : null}
        </div>
        {err ? <p className="border-t border-gray-100 px-6 py-3 text-sm text-red-600">{err}</p> : null}
      </AssessmentMainShell>
    );
  }

  const completed =
    (assessment.status ?? '').toLowerCase() === 'completed' || (assessment.status ?? '').toLowerCase() === 'approved';
  const inProgress = !completed;

  const scoreNum = assessment.overall_score != null ? Number(assessment.overall_score) : null;
  const scoreValid = scoreNum != null && !Number.isNaN(scoreNum);
  const band = scoreValid ? outcomeBand(scoreNum) : null;

  const scoredCount = CRITERIA_ORDER.filter((key) => {
    const ws = critByKey.get(key);
    return ws != null && !Number.isNaN(Number(ws));
  }).length;

  const criteriaRows = (
    <div className="px-6 py-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Criteria Progress</p>
      <ul className="grid grid-cols-1 gap-0">
        {CRITERIA_ORDER.map((key) => {
          const max = criteriaMaxPoints(key);
          const ws = critByKey.get(key);
          const raw = ws != null ? Number(ws) : NaN;
          const scored = !Number.isNaN(raw);
          const pct = scored && max > 0 ? Math.min(100, Math.max(0, (raw / max) * 100)) : 0;
          const barFill =
            !scored || max === 0 ? 'bg-gray-200' : raw / max < 0.6 ? 'bg-amber-400' : 'bg-[#0F8A6E]';
          return (
            <li key={key} className="flex items-center gap-3 border-b border-gray-100 py-2.5 last:border-0">
              <span className="w-12 shrink-0 rounded-md bg-[#0B1F45]/8 py-1 text-center text-xs font-bold text-[#0B1F45]">
                {max}%
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700">{criteriaTitle(key)}</p>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                  <div className={cn('h-full rounded-full transition-all', barFill)} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className={cn('shrink-0 text-xs tabular-nums', scored ? 'font-semibold text-gray-700' : 'text-gray-300')}>
                {scored ? `${raw} / ${max}` : `— / ${max}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const scoreBarPct = scoreValid ? Math.min(100, Math.max(0, (scoreNum / 100) * 100)) : 0;
  const scoreBarClass =
    !scoreValid ? 'bg-gray-200' : scoreNum >= PASS_THRESHOLD ? 'bg-[#0F8A6E]' : 'bg-red-400';

  const scoreSection = (
    <div className="border-b border-gray-200 bg-gray-50 px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-8">
        <div>
          {!scoreValid ? (
            <p className="text-4xl font-bold text-gray-300">
              —<span className="text-lg font-semibold text-gray-300">/ 100</span>
            </p>
          ) : (
            <p className={cn('text-4xl font-bold tabular-nums', completed && band ? band.color : 'text-[#0B1F45]')}>
              {scoreNum.toFixed(1)}
              <span className="text-lg font-semibold text-gray-400">/ 100</span>
            </p>
          )}
          <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">Overall Score</p>
          {completed && band ? <p className={cn('mt-2 text-sm font-medium', band.color)}>{band.label}</p> : null}
        </div>

        <div className="min-w-[8rem]">
          <p className="mb-1 text-xs text-gray-400">Pass threshold</p>
          <p className="text-sm font-semibold text-gray-600">
            {PASS_THRESHOLD} / 100
          </p>
          <div className="mt-2 h-2 w-32 rounded-full bg-gray-200">
            <div className={cn('h-2 rounded-full transition-all', scoreBarClass)} style={{ width: `${scoreBarPct}%` }} />
          </div>
        </div>

        <div>
          {!scoreValid ? (
            <span className="inline-flex rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
              Not Yet Assessed
            </span>
          ) : inProgress ? (
            <span className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-600">
              In Progress
            </span>
          ) : assessment.passed === true ? (
            <span className="inline-flex items-center rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700">
              <CheckCircle2 className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
              Passed
            </span>
          ) : (
            <span className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
              <XCircle className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
              Did Not Pass
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (inProgress) {
    return (
      <AssessmentMainShell fundName={displayFund} assessmentStatus={assessment.status}>
        {scoreSection}
        {criteriaRows}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 bg-gray-50 px-6 py-5">
          <div>
            <p className="text-sm text-gray-600">
              {scoredCount} of {CRITERIA_ORDER.length} criteria scored
            </p>
            <p className="mt-0.5 text-xs text-indigo-500">AI suggestions available for remaining criteria</p>
          </div>
          <Link
            href={`/assessments/${assessment.id}`}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F8A6E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0c755d]"
          >
            Continue Assessment →
          </Link>
        </div>
      </AssessmentMainShell>
    );
  }

  const passed = assessment.passed === true;

  const finalDecisionCard =
    !isCommitted && !isRejected ? (
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-[#0B1F45]">Final Decision</h4>
          <p className="mt-0.5 text-xs text-gray-400">Based on assessment score and overall evaluation</p>
        </div>
        {success ? <p className="mb-3 text-sm text-[#0F8A6E]">{success}</p> : null}
        {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}

        {passed && canWrite ? (
          <div className="space-y-4">
            {scoreValid && scoreNum >= PASS_THRESHOLD ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FinalOptionCard
                    tone="teal"
                    selected={finalChoice === 'approve'}
                    icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
                    title="✓ Approve"
                    subtitle="Proceed to commitment"
                    onClick={() => {
                      setErr(null);
                      setFinalChoice('approve');
                    }}
                  />
                  <FinalOptionCard
                    tone="amber"
                    selected={finalChoice === 'approve_conditions'}
                    icon={<AlertTriangle className="h-8 w-8" aria-hidden />}
                    title="Approve with Conditions"
                    subtitle="Commit with documented conditions"
                    onClick={() => {
                      setErr(null);
                      setFinalChoice('approve_conditions');
                    }}
                  />
                  <FinalOptionCard
                    tone="red"
                    selected={finalChoice === 'reject'}
                    icon={<XCircle className="h-8 w-8" aria-hidden />}
                    title="Reject"
                    subtitle="Do not advance"
                    onClick={() => {
                      setErr(null);
                      setFinalChoice('reject');
                    }}
                  />
                </div>
                {finalChoice === 'reject' ? (
                  <div className="w-full space-y-3 rounded-xl border border-red-100 bg-red-50/50 p-4">
                    <label className="block text-sm font-medium text-gray-700">Rejection reason</label>
                    <textarea
                      className="min-h-[100px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Explain why this application is being rejected…"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setFinalChoice(null);
                          setRejectReason('');
                        }}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="bg-red-600 text-white hover:bg-red-700"
                        disabled={busy || !rejectReason.trim()}
                        onClick={() => void postFinal('reject')}
                      >
                        Confirm reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full rounded-xl bg-[#0F8A6E] text-white hover:bg-[#0c755d] sm:w-auto"
                      disabled={busy || (finalChoice !== 'approve' && finalChoice !== 'approve_conditions')}
                      onClick={() => void postFinal('approve')}
                    >
                      {busy
                        ? 'Confirming…'
                        : finalChoice === 'approve_conditions'
                          ? 'Confirm — Approve with conditions'
                          : 'Confirm — Approve & commit'}
                    </Button>
                    {!finalChoice ? (
                      <p className="text-xs text-gray-500">Select Approve or Approve with Conditions, then confirm.</p>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="rounded-xl bg-[#0F8A6E] text-white hover:bg-[#0c755d]"
                  disabled={busy}
                  onClick={() => void postFinal('approve')}
                >
                  ✓ Approve — Proceed to Commitment
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                  disabled={busy}
                  onClick={() => setFinalChoice('reject')}
                >
                  ✗ Reject Application
                </Button>
              </div>
            )}
            {finalChoice === 'reject' && !(scoreValid && scoreNum >= PASS_THRESHOLD) ? (
              <div className="space-y-3 rounded-xl border border-red-100 bg-red-50/50 p-4">
                <label className="block text-sm font-medium text-gray-700">Rejection reason</label>
                <textarea
                  className="min-h-[100px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this application is being rejected…"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => { setFinalChoice(null); setRejectReason(''); }} disabled={busy}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="bg-red-600 text-white hover:bg-red-700"
                    disabled={busy || !rejectReason.trim()}
                    onClick={() => void postFinal('reject')}
                  >
                    Confirm reject
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : !passed ? (
          <p className="text-sm text-gray-500">Assessment did not meet the pass threshold; final approval is not available.</p>
        ) : (
          <p className="text-sm text-gray-500">You do not have permission to record the final decision.</p>
        )}
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <AssessmentMainShell fundName={displayFund} assessmentStatus={assessment.status}>
        {scoreSection}
        {criteriaRows}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 bg-gray-50 px-6 py-5">
          <div className="flex max-w-xl items-start gap-2">
            {passed ? (
              <>
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" aria-hidden />
                <p className="text-sm font-medium text-teal-700">
                  Assessment complete · Score: {scoreValid ? `${scoreNum.toFixed(1)}/100` : '—'} · Passed
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-red-600">
                Assessment complete · Score: {scoreValid ? `${scoreNum.toFixed(1)}/100` : '—'} · Did not meet threshold
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-xl border-gray-300">
              <Link href={`/assessments/${assessment.id}`}>View Full Assessment →</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl border-gray-300">
              <Link href={`/assessments/${assessment.id}?tab=insights`}>View AI Insights →</Link>
            </Button>
          </div>
        </div>

        <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
          Completed: {assessment.completed_at ? formatShortDate(assessment.completed_at) : '—'}
        </p>
      </AssessmentMainShell>

      {finalDecisionCard}

      {isCommitted ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 shadow-sm">
          <div className="flex gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-[#0F8A6E]" aria-hidden />
            <div>
              <p className="font-semibold text-[#0B1F45]">Application Approved</p>
              <p className="mt-1 text-sm text-teal-900">This fund has been approved for commitment.</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" disabled>
                View Commitment Details →
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isRejected ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="font-semibold text-red-900">Application Rejected</p>
          <p className="mt-1 text-sm text-red-800">This application has been rejected and will not proceed to commitment.</p>
        </div>
      ) : null}
    </div>
  );
}
