'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';

export interface AIFollowupQuestionsCardProps {
  assessmentId: string;
  overallScore: number;
  isScored: boolean;
}

type FollowupRow = {
  id: string;
  assessment_id: string;
  section_key: string;
  section_label: string;
  section_score: number | null;
  section_max_score: number | null;
  question: string;
  rationale: string | null;
  used: boolean;
  used_at: string | null;
  used_by: string | null;
  generated_at: string;
};

function pctForRow(q: FollowupRow): number {
  const max = Number(q.section_max_score ?? 0);
  const sc = Number(q.section_score ?? 0);
  if (max <= 0) return 0;
  return (sc / max) * 100;
}

function pctColorClass(pct: number): string {
  if (pct < 50) return 'text-red-600 bg-red-50';
  if (pct < 70) return 'text-amber-800 bg-amber-50';
  return 'text-teal-800 bg-teal-50';
}

export function AIFollowupQuestionsCard({ assessmentId, overallScore, isScored }: AIFollowupQuestionsCardProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [strongSubmission, setStrongSubmission] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const genLock = useRef(false);

  const sortedGroups = useMemo(() => {
    const map = new Map<string, FollowupRow[]>();
    for (const q of rows) {
      const arr = map.get(q.section_label) ?? [];
      arr.push(q);
      map.set(q.section_label, arr);
    }
    const entries = [...map.entries()].map(([label, qs]) => ({
      label,
      qs: [...qs].sort((a, b) => pctForRow(a) - pctForRow(b)),
      minPct: Math.min(...qs.map(pctForRow)),
    }));
    entries.sort((a, b) => a.minPct - b.minPct);
    return entries;
  }, [rows]);

  const generatedLabel = useMemo(() => {
    if (!rows.length) return null;
    const latest = rows.reduce((acc, r) => (r.generated_at > acc ? r.generated_at : acc), rows[0]!.generated_at);
    try {
      return new Date(latest).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return latest;
    }
  }, [rows]);

  const flatNumbered = useMemo(() => {
    let n = 0;
    const out: Array<{ num: number; q: FollowupRow }> = [];
    for (const g of sortedGroups) {
      for (const q of g.qs) {
        n += 1;
        out.push({ num: n, q });
      }
    }
    return out;
  }, [sortedGroups]);

  const toggleWhy = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const loadInitial = useCallback(async (): Promise<{ questions: FollowupRow[]; strongSubmission: boolean }> => {
    const res = await fetch(`/api/ai/followup-questions?assessment_id=${encodeURIComponent(assessmentId)}`);
    const j = (await res.json().catch(() => ({}))) as {
      questions?: FollowupRow[];
      strongSubmission?: boolean;
      error?: string;
    };
    if (!res.ok) throw new Error(j.error ?? 'Failed to load questions');
    return {
      questions: j.questions ?? [],
      strongSubmission: Boolean(j.strongSubmission),
    };
  }, [assessmentId]);

  const generate = useCallback(
    async (force: boolean) => {
      setError(null);
      setGenerating(true);
      try {
        const res = await fetch('/api/ai/followup-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assessment_id: assessmentId, force_regenerate: force }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          questions?: FollowupRow[];
          strongSubmission?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(j.error ?? 'Generation failed');
        if (j.strongSubmission) {
          setStrongSubmission(true);
          setRows(j.questions ?? []);
          return;
        }
        setStrongSubmission(false);
        setRows(j.questions ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to generate questions');
      } finally {
        setGenerating(false);
      }
    },
    [assessmentId],
  );

  useEffect(() => {
    if (!isScored) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { questions: existing, strongSubmission: strongFromGet } = await loadInitial();
        if (cancelled) return;
        setStrongSubmission(strongFromGet);
        if (existing.length > 0) {
          setRows(existing);
          return;
        }
        if (strongFromGet) {
          setRows([]);
          return;
        }
        if (genLock.current) return;
        genLock.current = true;
        await generate(false);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [assessmentId, generate, isScored, loadInitial]);

  const onRegenerate = useCallback(async () => {
    await generate(true);
  }, [assessmentId, generate]);

  const onToggleUsed = useCallback(
    async (q: FollowupRow, nextUsed: boolean) => {
      const prev = rows;
      const viewerId = user?.user_id ?? null;
      const optimistic = prev.map((r) =>
        r.id === q.id
          ? {
              ...r,
              used: nextUsed,
              used_at: nextUsed ? new Date().toISOString() : null,
              used_by: nextUsed && viewerId ? viewerId : null,
            }
          : r,
      );
      setRows(optimistic);

      try {
        const res = await fetch('/api/ai/followup-questions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_id: q.id, used: nextUsed }),
        });
        const j = (await res.json().catch(() => ({}))) as { question?: FollowupRow; error?: string };
        if (!res.ok || !j.question) throw new Error(j.error ?? 'Update failed');
        setRows((curr) => curr.map((r) => (r.id === q.id ? { ...r, ...(j.question as FollowupRow) } : r)));
      } catch {
        setRows(prev);
      }
    },
    [rows, user?.user_id],
  );

  if (!isScored) return null;

  const showSkeleton = loading || generating;
  const showStrong = strongSubmission && rows.length === 0 && !error && !showSkeleton;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-[#00A99D]" aria-hidden />
            <h3 className="text-base font-semibold text-gray-900">
              {generating ? 'Generating questions…' : 'AI Follow-up Questions'}
            </h3>
            {generating ? <Loader2 className="h-4 w-4 animate-spin text-[#00A99D]" aria-hidden /> : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
              <Sparkles className="h-2.5 w-2.5 text-[#00A99D]" aria-hidden />
              AI Generated
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Targeted questions for your next meeting with the fund manager — based on weakest scoring sections
          </p>
          <p className="text-xs text-gray-500 tabular-nums">Overall score: {overallScore.toFixed(1)} / 100</p>
        </div>
        <button
          type="button"
          disabled={generating || loading}
          onClick={() => void onRegenerate()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#00A99D] bg-white px-2.5 py-1 text-xs font-medium text-[#00A99D] hover:bg-teal-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} aria-hidden />
          Regenerate
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {error ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div>
                <p className="font-medium">Unable to generate questions at this time</p>
                <p className="mt-1 text-xs text-amber-900/90">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onRegenerate()}
              className="self-start rounded-md border border-amber-700 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Regenerate
            </button>
          </div>
        ) : null}

        {showSkeleton && !error ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="mb-2 h-3 w-1/3 rounded bg-gray-200" />
                <div className="h-3 w-full rounded bg-gray-200" />
                <div className="mt-2 h-3 w-5/6 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : null}

        {showStrong ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-5 text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-[#00A99D]" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-[#0B1F45]">Strong submission — no critical gaps identified</p>
            <p className="mt-1 text-xs text-teal-900/80">All sections scored above threshold</p>
          </div>
        ) : null}

        {!showSkeleton && !showStrong && rows.length > 0 ? (
          <div className="space-y-8">
            {sortedGroups.map((group) => {
              const worst = group.qs.reduce((a, b) => (pctForRow(a) <= pctForRow(b) ? a : b));
              const pct = pctForRow(worst);
              const badgeCls = pctColorClass(pct);
              const max = Number(worst.section_max_score ?? 0);
              const sc = Number(worst.section_score ?? 0);
              const pctRounded = Math.round(pct * 10) / 10;
              return (
                <div key={group.label}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                    <p className="text-sm font-semibold text-gray-700">{group.label}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${badgeCls}`}>
                      {sc}/{max} ({pctRounded}%)
                    </span>
                  </div>
                  <ul className="mt-3 space-y-4">
                    {group.qs.map((q) => {
                      const flat = flatNumbered.find((x) => x.q.id === q.id);
                      const num = flat?.num ?? 0;
                      const rationale = (q.rationale ?? '').trim();
                      const showRationale = expanded.has(q.id);
                      const usedAtFmt = q.used_at
                        ? new Date(q.used_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : null;
                      return (
                        <li key={q.id} className="flex gap-3 border-b border-gray-50 pb-4 last:border-0">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#00A99D]/40 bg-teal-50 text-xs font-semibold text-[#00A99D]"
                            aria-hidden
                          >
                            {num}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800">{q.question}</p>
                            {rationale ? (
                              <div className="mt-1">
                                <button
                                  type="button"
                                  onClick={() => toggleWhy(q.id)}
                                  className="text-xs font-medium text-[#00A99D] underline-offset-2 hover:underline"
                                >
                                  Why this question?
                                </button>
                                {showRationale ? (
                                  <p className="mt-1 text-xs italic text-gray-400">{rationale}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <button
                              type="button"
                              onClick={() => void onToggleUsed(q, !q.used)}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                                q.used
                                  ? 'bg-[#00A99D] text-white'
                                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {q.used ? (
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                              ) : (
                                <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                              )}
                              {q.used ? 'Used' : 'Mark Used'}
                            </button>
                            {q.used && usedAtFmt ? (
                              <span className="text-[10px] text-gray-400">{usedAtFmt}</span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col items-center gap-1 border-t border-gray-100 pt-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-xs italic text-gray-400">
          Questions generated by Claude based on scoring gaps. Review before use in meetings.
        </p>
        {generatedLabel ? <p className="text-xs text-gray-400">Generated: {generatedLabel}</p> : null}
      </div>
    </div>
  );
}
