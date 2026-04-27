'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { ASSESSMENT_CRITERIA, CRITERIA_ORDER, PASS_THRESHOLD, type CriteriaKey } from '@/lib/scoring/config';
import { determineOutcome, previewOverallWeighted } from '@/lib/scoring/calculate';
import type { SubcriteriaState } from '@/components/assessment/CriteriaTab';
import { AssessmentWorkspace } from '@/components/assessment/AssessmentWorkspace';
import { AssessmentInsightsDashboard } from '@/components/assessment/AssessmentInsightsDashboard';
import { Button } from '@/components/ui/button';
import { EntityActivitySection } from '@/components/audit/EntityActivitySection';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type { QuestionnaireBundle } from '@/lib/assessment/questionnaire-bundle';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getAiSubcriteriaSuggestion, parseAiSuggestionStore } from '@/lib/assessment/ai-suggestion-utils';

type CriteriaRow = {
  id: string;
  criteria_key: string;
  raw_score: number | null;
  weighted_score: number | null;
  max_points: number;
  subcriteria: Array<{
    id: string;
    subcriteria_key: string;
    description: string | null;
    max_points: number;
    score: number | null;
    notes: string | null;
  }>;
};

type Payload = {
  assessment: {
    id: string;
    status: string;
    overall_score: number | null;
    passed: boolean | null;
    completed_at: string | null;
    questionnaire_id?: string | null;
    ai_narrative?: unknown;
    ai_assessed_at?: string | null;
    ai_overall_assessment?: string | null;
    ai_subcriteria_suggestions?: unknown;
  };
  application: { fund_name: string; manager_name: string } | null;
  evaluator: { full_name: string; email: string } | null;
  criteria: CriteriaRow[];
};

function emptyState(): Record<CriteriaKey, SubcriteriaState> {
  const o = {} as Record<CriteriaKey, SubcriteriaState>;
  for (const c of ASSESSMENT_CRITERIA) {
    o[c.key] = {};
    for (const sc of c.subcriteria) {
      o[c.key][sc.key] = { score: null, notes: '' };
    }
  }
  return o;
}

function stateFromPayload(criteria: CriteriaRow[]): Record<CriteriaKey, SubcriteriaState> {
  const st = emptyState();
  for (const row of criteria) {
    const key = row.criteria_key as CriteriaKey;
    if (!st[key]) continue;
    for (const s of row.subcriteria) {
      st[key][s.subcriteria_key] = {
        score: s.score === null || s.score === undefined ? null : Number(s.score),
        notes: s.notes ?? '',
      };
    }
  }
  return st;
}

function formatAssessedShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
  } catch {
    return '';
  }
}

export function AssessmentEditor({
  assessmentId,
  actorRole,
  canScoreNarrative,
  canRunAiAssessment,
  questionnaireBundle,
  questionnaireStatus,
  initialMainTab = 'scoring',
}: {
  assessmentId: string;
  actorRole: string;
  canScoreNarrative: boolean;
  canRunAiAssessment: boolean;
  questionnaireBundle: QuestionnaireBundle;
  questionnaireStatus: string | null;
  initialMainTab?: 'scoring' | 'ai_insights';
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [mainTab, setMainTab] = useState<'scoring' | 'ai_insights'>(initialMainTab);
  const [state, setState] = useState<Record<CriteriaKey, SubcriteriaState>>(emptyState());
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [aiNarrativeWarn, setAiNarrativeWarn] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [acceptBanner, setAcceptBanner] = useState<string | null>(null);
  const autoRunStarted = useRef(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    setAiNarrativeWarn(null);
    const res = await fetch(`/api/assessments/${assessmentId}`);
    const j = (await res.json()) as Payload & { error?: string };
    if (!res.ok) {
      setLoadErr(j.error ?? 'Failed to load');
      setPayload(null);
      return;
    }
    setPayload(j as Payload);
    setState(stateFromPayload(j.criteria));
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    autoRunStarted.current = false;
  }, [assessmentId]);

  const locked = payload?.assessment.status === 'completed' || payload?.assessment.status === 'approved';
  const editable = !locked || actorRole === 'admin';

  const preview = useMemo(() => previewOverallWeighted(state), [state]);
  const displayScore =
    !payload
      ? preview
      : payload.assessment.status === 'completed' && payload.assessment.overall_score != null
        ? Number(payload.assessment.overall_score)
        : preview;
  const outcomePreview = useMemo(() => determineOutcome(displayScore), [displayScore]);

  const totalSubs = useMemo(() => ASSESSMENT_CRITERIA.reduce((s, c) => s + c.subcriteria.length, 0), []);
  const scoredSubCount = useMemo(() => {
    let n = 0;
    for (const c of ASSESSMENT_CRITERIA) {
      for (const sc of c.subcriteria) {
        const v = state[c.key][sc.key]?.score;
        if (v != null && !Number.isNaN(Number(v))) n += 1;
      }
    }
    return n;
  }, [state]);

  const criteriaCompleteCount = useMemo(
    () =>
      CRITERIA_ORDER.filter((ck) => {
        const d = ASSESSMENT_CRITERIA.find((c) => c.key === ck)!;
        return d.subcriteria.every((sc) => {
          const v = state[ck][sc.key]?.score;
          return v != null && !Number.isNaN(Number(v));
        });
      }).length,
    [state],
  );

  const aiStore = useMemo(() => parseAiSuggestionStore(payload?.assessment.ai_subcriteria_suggestions ?? null), [payload]);

  const aiSuggestionCoverage = useMemo(() => {
    if (!aiStore) return 0;
    let n = 0;
    for (const c of ASSESSMENT_CRITERIA) {
      for (const sc of c.subcriteria) {
        if (getAiSubcriteriaSuggestion(aiStore, c.key, sc.key)) n += 1;
      }
    }
    return n;
  }, [aiStore]);

  const runAi = useCallback(async () => {
    setAiErr(null);
    setAiBusy(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/ai-assess`, { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setAiErr(j.error ?? 'AI assessment failed');
        return;
      }
      await load();
    } finally {
      setAiBusy(false);
    }
  }, [assessmentId, load]);

  useEffect(() => {
    if (!payload || !canRunAiAssessment || locked) return;
    const q = (questionnaireStatus ?? '').toLowerCase();
    if (q !== 'completed') return;
    if (payload.assessment.ai_assessed_at) return;
    if (autoRunStarted.current) return;
    const t = window.setTimeout(() => {
      autoRunStarted.current = true;
      void runAi();
    }, 2000);
    return () => window.clearTimeout(t);
  }, [canRunAiAssessment, locked, payload, questionnaireStatus, runAi]);

  const onCellChange = (criteriaKey: CriteriaKey, subKey: string, patch: { score: number | null; notes: string }) => {
    setState((prev) => ({
      ...prev,
      [criteriaKey]: {
        ...prev[criteriaKey],
        [subKey]: { ...prev[criteriaKey][subKey], ...patch },
      },
    }));
  };

  const saveSection = async (key: CriteriaKey) => {
    setActionErr(null);
    setSaving(true);
    try {
      const def = ASSESSMENT_CRITERIA.find((c) => c.key === key)!;
      const subcriteria = def.subcriteria.map((sc) => ({
        subcriteria_key: sc.key,
        score: state[key][sc.key]?.score ?? null,
        notes: state[key][sc.key]?.notes ?? '',
      }));
      const res = await fetch(`/api/assessments/${assessmentId}/criteria/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcriteria }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setActionErr(j.error ?? 'Save failed');
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    setActionErr(null);
    setAiNarrativeWarn(null);
    setCompleting(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/complete`, { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string[];
        ai_narrative_error?: string;
      };
      if (!res.ok) {
        setActionErr([j.error, ...(j.details ?? [])].filter(Boolean).join(' — '));
        return;
      }
      if (j.ai_narrative_error) {
        setAiNarrativeWarn(
          `Assessment was completed, but AI narrative generation failed: ${j.ai_narrative_error} You can retry from the AI Insights tab.`,
        );
      }
      await load();
      if (!j.ai_narrative_error) setMainTab('ai_insights');
    } finally {
      setCompleting(false);
    }
  };

  const unlock = async () => {
    setActionErr(null);
    const res = await fetch(`/api/assessments/${assessmentId}/unlock`, { method: 'POST' });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setActionErr(j.error ?? 'Unlock failed');
      return;
    }
    await load();
  };

  const acceptAllAi = () => {
    if (!aiStore) return;
    for (const c of ASSESSMENT_CRITERIA) {
      for (const sc of c.subcriteria) {
        const sug = getAiSubcriteriaSuggestion(aiStore, c.key, sc.key);
        if (!sug) continue;
        const clamped = Math.min(sc.maxPoints, Math.max(0, Math.round(Number(sug.suggested_score))));
        onCellChange(c.key, sc.key, { score: clamped, notes: state[c.key][sc.key]?.notes ?? '' });
      }
    }
    setAcceptBanner('All AI scores applied — review and override any you disagree with.');
  };

  const completeDisabled = !editable || completing || scoredSubCount < totalSubs;
  const acceptAllDisabled = !aiStore || !editable || locked || aiSuggestionCoverage < totalSubs;

  if (loadErr || !payload) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-[#0B1F45]">
        {loadErr ?? 'Loading…'}
      </div>
    );
  }

  const completedAt = payload.assessment.completed_at ? formatDateTime(payload.assessment.completed_at) : null;
  const assessmentComplete =
    payload.assessment.status === 'completed' || payload.assessment.status === 'approved';
  const aiAssessedAt = payload.assessment.ai_assessed_at ?? null;
  const fundName = payload.application?.fund_name ?? 'Fund';
  const managerName = payload.application?.manager_name ?? '—';
  const evaluatorLine = `Evaluator: ${payload.evaluator?.full_name ?? '—'}`;

  return (
    <div className="w-full space-y-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition-colors hover:border-gray-400"
        >
          <Link href="/assessments">← Assessments</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition-colors hover:border-gray-400"
        >
          <Link href="/fund-applications">Fund applications</Link>
        </Button>
      </div>

      <header className="bg-[#0B1F45] px-6 py-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/50">Assessment</p>
            <h1 className="text-lg font-bold leading-snug">{fundName}</h1>
            <p className="mt-0.5 text-xs text-white/45">Assessment · scoring and AI insights</p>
            <p className="mt-1 text-xs text-white/40">
              {managerName} · {evaluatorLine}
            </p>
            {completedAt ? <p className="mt-1 text-[11px] text-white/30">Completed {completedAt}</p> : null}
            {locked && actorRole === 'admin' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 border-white/30 bg-transparent text-xs text-white hover:bg-white/10"
                onClick={() => void unlock()}
              >
                Admin unlock
              </Button>
            ) : null}
          </div>

          <div className="flex min-w-[10rem] flex-1 flex-col items-center gap-1 text-center text-xs text-indigo-200">
            {aiAssessedAt ? (
              <>
                <p className="inline-flex items-center gap-1 font-medium">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-300" aria-hidden />
                  AI assessed · {formatAssessedShort(aiAssessedAt)}
                </p>
                {canRunAiAssessment ? (
                  <button
                    type="button"
                    disabled={aiBusy || locked}
                    onClick={() => void runAi()}
                    className="text-indigo-300 underline decoration-indigo-400/60 underline-offset-2 hover:text-white disabled:opacity-40"
                  >
                    {aiBusy ? 'Regenerating…' : 'Regenerate'}
                  </button>
                ) : null}
              </>
            ) : canRunAiAssessment && !locked ? (
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => void runAi()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-60"
              >
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                {aiBusy ? 'Analysing…' : 'Generate AI assessment'}
              </button>
            ) : (
              <p className="text-white/35">No AI run yet</p>
            )}
          </div>

          <div className="flex shrink-0 gap-1 rounded-lg bg-white/10 p-1">
            <button
              type="button"
              onClick={() => setMainTab('scoring')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                mainTab === 'scoring' ? 'bg-white text-[#0B1F45]' : 'text-white/80 hover:bg-white/5',
              )}
            >
              Scoring
            </button>
            <button
              type="button"
              onClick={() => setMainTab('ai_insights')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                mainTab === 'ai_insights' ? 'bg-white text-[#0B1F45]' : 'text-white/80 hover:bg-white/5',
              )}
            >
              AI Insights
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 border-b border-gray-200 bg-white px-6 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Status</span>
          <StatusBadge status={payload.assessment.status} />
        </div>
        <span className="hidden text-gray-200 sm:inline">|</span>
        <p className="text-gray-600">
          Progress:{' '}
          <span className="font-semibold text-gray-800">
            {criteriaCompleteCount} of 7 criteria · {scoredSubCount} of {totalSubs} subcriteria
          </span>
        </p>
        <span className="hidden text-gray-200 sm:inline">|</span>
        <div className="flex items-center gap-2">
          <span className="text-gray-600">Score:</span>
          <span className="font-semibold text-gray-800 tabular-nums">{displayScore.toFixed(1)} / 100</span>
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-xs font-semibold',
              displayScore >= PASS_THRESHOLD ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-900',
            )}
          >
            {displayScore >= PASS_THRESHOLD ? 'Pass' : 'Not passed'}
          </span>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {acceptBanner ? <span className="text-xs text-teal-700">{acceptBanner}</span> : null}
          {aiErr ? <span className="text-xs text-red-600">{aiErr}</span> : null}
          <button
            type="button"
            disabled={acceptAllDisabled}
            onClick={acceptAllAi}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Accept All AI Scores
          </button>
          <button
            type="button"
            disabled={completeDisabled}
            title={completeDisabled ? 'Score every subcriterion before completing.' : undefined}
            onClick={() => void complete()}
            className="rounded-lg bg-[#0B1F45] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#162d5e] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {completing ? 'Completing…' : 'Complete Assessment'}
          </button>
        </div>
      </div>

      {actionErr ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-950">{actionErr}</div>
      ) : null}
      {aiNarrativeWarn ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-950">{aiNarrativeWarn}</div>
      ) : null}

      {mainTab === 'scoring' ? (
        <AssessmentWorkspace
          questionnaireId={payload.assessment.questionnaire_id ?? questionnaireBundle.id ?? null}
          bundle={questionnaireBundle}
          aiOverall={payload.assessment.ai_overall_assessment ?? null}
          aiRaw={payload.assessment.ai_subcriteria_suggestions ?? null}
          locked={locked}
          editable={editable}
          state={state}
          onCellChange={onCellChange}
          saveSection={saveSection}
          saving={saving}
          scoredSubCount={scoredSubCount}
          totalSubs={totalSubs}
          activityAssessmentId={assessmentId}
        />
      ) : (
        <AssessmentInsightsDashboard
          assessmentId={assessmentId}
          assessmentComplete={assessmentComplete}
          canUseNarrative={canScoreNarrative}
          rawNarrative={payload.assessment.ai_narrative}
          onRefresh={load}
          displayScore={displayScore}
          outcomeBand={outcomePreview.band}
          outcomeLabel={outcomePreview.label}
          recommendationLabel={outcomePreview.recommendationLabel}
          aiOverallDd={payload.assessment.ai_overall_assessment ?? null}
          state={state}
        />
      )}

      {mainTab === 'ai_insights' ? (
        <div className="mt-8 px-1">
          <EntityActivitySection entityType="assessment" entityId={assessmentId} />
        </div>
      ) : null}
    </div>
  );
}
