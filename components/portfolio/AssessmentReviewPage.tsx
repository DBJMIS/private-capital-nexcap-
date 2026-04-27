'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { DimensionKey } from '@/lib/portfolio/types';
import type { VcQuarterlyAssessment } from '@/types/database';

type AssessmentWithNames = VcQuarterlyAssessment & {
  assessed_by_name?: string | null;
  approved_by_name?: string | null;
  dd_reference?: {
    id: string;
    recommendation: string | null;
    score: number | null;
    completed_at: string | null;
  } | null;
};

const DIMS: { key: DimensionKey; label: string; scoreField: keyof VcQuarterlyAssessment }[] = [
  { key: 'financial_performance', label: 'Financial performance', scoreField: 'financial_performance_score' },
  { key: 'development_impact', label: 'Development impact', scoreField: 'development_impact_score' },
  { key: 'fund_management', label: 'Fund management', scoreField: 'fund_management_score' },
  { key: 'compliance_governance', label: 'Compliance & governance', scoreField: 'compliance_governance_score' },
  { key: 'portfolio_health', label: 'Portfolio health', scoreField: 'portfolio_health_score' },
];

type DimFactorRow = { label: string; value: string; adjustment: number; detail?: string };

type DimReasoningBlock = {
  factors?: DimFactorRow[];
  base_score?: number;
  final_score?: number;
};

function totalAdjustmentFromFactors(factors: DimFactorRow[]): number {
  return factors.reduce((s, f) => s + (Number.isFinite(f.adjustment) ? f.adjustment : 0), 0);
}

function adjustmentCellClass(adj: number): string {
  if (adj > 0) return 'text-green-700';
  if (adj < 0) return 'text-red-700';
  return 'text-gray-400';
}

function formatAdjustmentDisplay(adj: number): string {
  if (adj > 0) return `+${adj}`;
  return String(adj);
}

type Props = {
  fundId: string;
  fundName: string;
  initialAssessment?: AssessmentWithNames | null;
};

export function AssessmentReviewPage({ fundId, fundName, initialAssessment = null }: Props) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<AssessmentWithNames | null>(initialAssessment);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [editSummaryManually, setEditSummaryManually] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState<Partial<Record<DimensionKey, boolean>>>({});
  const [overrideScore, setOverrideScore] = useState<Partial<Record<DimensionKey, string>>>({});
  const [overrideReason, setOverrideReason] = useState<Partial<Record<DimensionKey, string>>>({});

  useEffect(() => {
    if (assessment) return;
    void (async () => {
      const now = new Date();
      const period = `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`;
      const assessmentDate = now.toISOString().slice(0, 10);
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessment_period: period, assessment_date: assessmentDate }),
      });
      const j = (await res.json()) as { assessment?: AssessmentWithNames; error?: string };
      if (res.ok && j.assessment) {
        setAssessment(j.assessment);
      } else {
        setErr(j.error ?? 'Failed to initialize assessment');
      }
    })();
  }, [assessment, fundId]);

  const canSubmit = useMemo(() => {
    if (!assessment) return false;
    return !!assessment.ai_summary?.trim() && assessment.status === 'draft';
  }, [assessment]);

  if (!assessment) {
    return (
      <div className="py-10 text-center text-sm text-gray-500">
        {err ? <span className="text-red-700">{err}</span> : 'Preparing auto-derived assessment…'}
      </div>
    );
  }

  const asm = assessment;
  const reasoning = (asm.dimension_reasoning ?? {}) as Record<string, unknown>;
  const snippets = (asm.source_snippets ?? {}) as Record<string, unknown>;

  async function refreshAssessment() {
    const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${asm.id}`);
    const j = (await res.json()) as { assessment?: AssessmentWithNames; error?: string };
    if (!res.ok || !j.assessment) throw new Error(j.error ?? 'Failed to load assessment');
    setAssessment(j.assessment);
  }

  async function recompute() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${asm.id}/recompute`, { method: 'POST' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Recompute failed');
      await refreshAssessment();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveOverride(dim: DimensionKey) {
    const score = Number(overrideScore[dim] ?? '');
    const reason = (overrideReason[dim] ?? '').trim();
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setErr(`Override score for ${dim} must be between 0 and 100.`);
      return;
    }
    if (!reason) {
      setErr(`Override reason for ${dim} is required.`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${asm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimension_overrides: {
            [dim]: { score, reason },
          },
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Override update failed');
      setOverrideOpen((s) => ({ ...s, [dim]: false }));
      await refreshAssessment();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function regenerateAiSummary() {
    setAiBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${asm.id}/ai-summary`, { method: 'POST' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'AI summary failed');
      await refreshAssessment();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAiBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${asm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft', ai_summary: asm.ai_summary ?? null }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Save failed');
      await refreshAssessment();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${asm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submitted', ai_summary: asm.ai_summary ?? null }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Submit failed');
      router.replace(`/portfolio/funds/${fundId}/assessments/${asm.id}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-6 pb-16">
      <div className="rounded-xl bg-[#0B1F45] px-6 py-5 text-white">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{fundName}</h1>
            <p className="mt-1 text-sm text-white/70">Quarterly auto-derived assessment · {assessment.assessment_period}</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded bg-white/10 px-2 py-1">Lifecycle {assessment.fund_lifecycle_stage}</span>
            <span className="rounded bg-white/10 px-2 py-1">
              Weighted {assessment.weighted_total_score != null ? Number(assessment.weighted_total_score).toFixed(1) : '—'}
            </span>
            <span className="rounded bg-white/10 px-2 py-1 capitalize">{assessment.category ?? '—'}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveDraft()}>
            Save draft
          </Button>
          <Button type="button" className="bg-[#0F8A6E] hover:bg-[#0c6f58]" disabled={busy || !canSubmit} onClick={() => void submit()}>
            Submit
          </Button>
          <Button type="button" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10" disabled={busy} onClick={() => void recompute()}>
            Recompute
          </Button>
          <Link href={`/portfolio/funds/${fundId}?tab=assessments`} className="self-center text-sm text-white/80 underline">
            Cancel
          </Link>
        </div>
      </div>

      {err ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {DIMS.map((d) => {
            const key = d.key;
            const score = assessment[d.scoreField];
            const dimReasoning = (reasoning[key] ?? null) as DimReasoningBlock | null;
            const dimSnippets = (snippets[key] ?? []) as string[];
            const factors = dimReasoning?.factors ?? [];
            const baseScore = dimReasoning?.base_score ?? 50;
            const totalAdj = totalAdjustmentFromFactors(factors);
            const finalNum = dimReasoning?.final_score ?? (score != null ? Number(score) : null);
            const finalStr = finalNum != null && Number.isFinite(finalNum) ? Number(finalNum).toFixed(1) : '—';
            return (
              <section key={key} className="mb-4 rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-base font-medium text-gray-900">{d.label}</h2>
                  <span className="text-3xl font-medium tabular-nums text-gray-900">
                    {score != null ? Number(score).toFixed(1) : '—'}
                  </span>
                </div>
                <div className="mt-3">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col className="w-[40%]" />
                      <col className="w-[45%]" />
                      <col className="w-[15%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Factor</th>
                        <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Value</th>
                        <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400">Adj.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factors.map((f, i) => (
                        <tr key={`${key}-${i}`} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 text-gray-700">{f.label}</td>
                          <td className="min-w-0 truncate py-2 text-left text-gray-700" title={f.value}>
                            {f.value}
                          </td>
                          <td
                            className={`py-2 text-right text-sm font-medium tabular-nums ${adjustmentCellClass(f.adjustment)}`}
                          >
                            {formatAdjustmentDisplay(f.adjustment)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 border-t border-gray-50 pt-2 text-right text-xs text-gray-400">
                    Base {baseScore} + {totalAdj} = {finalStr}
                  </p>
                </div>
                {dimSnippets.length ? (
                  <div className="mt-3 space-y-1">
                    {dimSnippets.map((s, i) => (
                      <blockquote key={`${key}-s-${i}`} className="border-l-2 border-gray-200 pl-3 text-xs italic text-gray-600">
                        "{s}"
                      </blockquote>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3">
                  {!overrideOpen[key] ? (
                    <button type="button" className="text-sm text-[#0F8A6E] underline" onClick={() => setOverrideOpen((s) => ({ ...s, [key]: true }))}>
                      Override this score
                    </button>
                  ) : (
                    <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          className="h-9 w-24 rounded border border-gray-300 px-2 text-sm"
                          value={overrideScore[key] ?? ''}
                          onChange={(e) => setOverrideScore((s) => ({ ...s, [key]: e.target.value }))}
                        />
                        <Button type="button" size="sm" disabled={busy} onClick={() => void saveOverride(key)}>
                          Apply override
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setOverrideOpen((s) => ({ ...s, [key]: false }))}>
                          Cancel
                        </Button>
                      </div>
                      <Textarea
                        rows={2}
                        placeholder="Override reason (required)"
                        value={overrideReason[key] ?? ''}
                        onChange={(e) => setOverrideReason((s) => ({ ...s, [key]: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-base font-semibold text-[#0B1F45]">Original Due Diligence Outcome</h2>
            {assessment.dd_reference ? (
              <div className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-gray-400">Outcome</p>
                  <p className="font-medium capitalize">{(assessment.dd_reference.recommendation ?? assessment.dd_outcome_at_commitment ?? '—').replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-400">Score</p>
                  <p className="font-medium">{assessment.dd_reference.score != null ? Number(assessment.dd_reference.score).toFixed(2) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-400">Date</p>
                  <p className="font-medium">
                    {assessment.dd_reference.completed_at
                      ? new Date(`${assessment.dd_reference.completed_at}`).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-400">Reference</p>
                  <Link href={`/assessments/${assessment.dd_reference.id}`} className="font-medium text-[#0F8A6E] underline">
                    View original DD assessment
                  </Link>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No completed due diligence assessment is linked to this quarterly assessment.</p>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#0B1F45]">AI summary</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-sm text-[#0F8A6E] underline disabled:opacity-50"
                  disabled={aiBusy}
                  onClick={() => void regenerateAiSummary()}
                >
                  {aiBusy ? 'Regenerating…' : 'Regenerate'}
                </button>
                <button
                  type="button"
                  className="text-sm text-gray-600 underline"
                  onClick={() => {
                    if (editSummaryManually) {
                      void (async () => {
                        setBusy(true);
                        setErr(null);
                        try {
                          const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${asm.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ai_summary: asm.ai_summary ?? null }),
                          });
                          const j = (await res.json()) as { error?: string };
                          if (!res.ok) throw new Error(j.error ?? 'Save failed');
                          await refreshAssessment();
                          setEditSummaryManually(false);
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : 'Failed');
                        } finally {
                          setBusy(false);
                        }
                      })();
                    } else {
                      setEditSummaryManually(true);
                      setErr(null);
                    }
                  }}
                >
                  {editSummaryManually ? 'View read-only' : 'Edit manually'}
                </button>
              </div>
            </div>
            {!assessment.ai_summary?.trim() && !editSummaryManually ? (
              <div className="mt-3 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <p>AI summary generation failed — click Regenerate to retry</p>
                <Button type="button" size="sm" variant="outline" className="shrink-0 border-amber-300" disabled={aiBusy} onClick={() => void regenerateAiSummary()}>
                  {aiBusy ? 'Regenerating…' : 'Regenerate'}
                </Button>
              </div>
            ) : null}
            {editSummaryManually ? (
              <Textarea
                className="mt-3"
                rows={8}
                value={assessment.ai_summary ?? ''}
                onChange={(e) => setAssessment((prev) => (prev ? { ...prev, ai_summary: e.target.value } : prev))}
              />
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{assessment.ai_summary?.trim() ? assessment.ai_summary : '—'}</p>
            )}
          </section>
        </div>

        <aside className="sticky top-20 h-fit w-80 shrink-0 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Narrative source</h3>
          {assessment.narrative_extract_id ? (
            <div className="mt-3 text-sm text-gray-700">
              <p className="mb-2 text-xs text-gray-500">Narrative extract linked to this assessment.</p>
              <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs">
                {JSON.stringify(snippets, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="mt-3 text-sm text-blue-700">
              No narrative data extracted. Upload the latest quarterly report on the Reporting tab to enrich this assessment.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
