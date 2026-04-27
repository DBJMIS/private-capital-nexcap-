'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Download, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { VcQuarterlyAssessment } from '@/types/database';

type AssessmentRow = VcQuarterlyAssessment & {
  assessed_by_name?: string | null;
  approved_by_name?: string | null;
  dd_reference?: {
    id: string;
    recommendation: string | null;
    score: number | null;
    completed_at: string | null;
  } | null;
};

const DIMS: { key: string; label: string; scoreKey: keyof VcQuarterlyAssessment; textKey: keyof VcQuarterlyAssessment }[] = [
  { key: 'financial_performance', label: 'Financial performance', scoreKey: 'financial_performance_score', textKey: 'financial_commentary' },
  { key: 'development_impact', label: 'Development impact', scoreKey: 'development_impact_score', textKey: 'impact_commentary' },
  { key: 'fund_management', label: 'Fund management', scoreKey: 'fund_management_score', textKey: 'management_commentary' },
  { key: 'compliance_governance', label: 'Compliance & governance', scoreKey: 'compliance_governance_score', textKey: 'compliance_commentary' },
  { key: 'portfolio_health', label: 'Portfolio health', scoreKey: 'portfolio_health_score', textKey: 'portfolio_commentary' },
];

type DimFactorRow = { label: string; value: string; adjustment: number };

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

export function AssessmentReviewClient({
  fundId,
  fundName,
  initial,
  isAdmin,
}: {
  fundId: string;
  fundName: string;
  initial: AssessmentRow;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [row, setRow] = useState<AssessmentRow>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [editSummaryManually, setEditSummaryManually] = useState(false);
  const [contractual, setContractual] = useState(!!initial.contractual_obligation);
  const [overrideReason, setOverrideReason] = useState(initial.recommendation_override_reason ?? '');

  useEffect(() => {
    setContractual(!!row.contractual_obligation);
    setOverrideReason(row.recommendation_override_reason ?? '');
  }, [row.contractual_obligation, row.recommendation_override_reason, row.status]);

  const readOnly = useMemo(() => row.status === 'approved', [row.status]);
  const showAdminBar = isAdmin && row.status === 'submitted';
  const dimReasoning = (row.dimension_reasoning ?? {}) as Record<string, unknown>;
  const dimOverrides = (row.dimension_overrides ?? {}) as Record<string, unknown>;
  const dimSnippets = (row.source_snippets ?? {}) as Record<string, unknown>;

  const reload = async () => {
    const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${row.id}`);
    const j = (await res.json()) as { assessment?: AssessmentRow; error?: string };
    if (res.ok && j.assessment) setRow(j.assessment);
  };

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Update failed');
      await reload();
      router.refresh();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onApprove = () =>
    void patch({
      status: 'approved',
      contractual_obligation: contractual,
      recommendation_override_reason: overrideReason.trim() || null,
    });

  const onReturn = () => void patch({ status: 'draft' });

  const onSaveContractual = () =>
    void patch({
      contractual_obligation: contractual,
      recommendation_override_reason: overrideReason.trim() || null,
    });

  const regenerateAiSummary = async () => {
    if (readOnly) return;
    setAiBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/assessments/${row.id}/ai-summary`, { method: 'POST' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'AI summary failed');
      await reload();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAiBusy(false);
    }
  };

  const onAiSummaryLocalChange = (v: string) => {
    setRow((r) => ({ ...r, ai_summary: v }));
  };

  return (
    <div className="w-full space-y-6 pb-16">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <Link href={`/portfolio/funds/${fundId}?tab=assessments`} className="text-[#0F8A6E] hover:underline">
          ← {fundName}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-gray-700">{row.assessment_period}</span>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div className="rounded-xl bg-[#0B1F45] px-6 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Quarterly assessment</h1>
            <p className="mt-1 text-sm text-white/70">
              {fundName} · {row.assessment_date} · {row.fund_lifecycle_stage} stage
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold capitalize text-white ring-1 ring-white/25">
              {row.status}
            </span>
            {row.category ? (
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold capitalize text-white ring-1 ring-white/25">
                {row.category}
              </span>
            ) : null}
            {row.divestment_recommendation ? (
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold capitalize text-white ring-1 ring-white/25">
                {row.divestment_recommendation.replace(/_/g, ' ')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-white/50">Weighted total</p>
            <p className="text-lg font-semibold">{row.weighted_total_score != null ? Number(row.weighted_total_score).toFixed(1) : '—'}</p>
          </div>
          <div>
            <p className="text-white/50">Assessed by</p>
            <p className="font-medium">{row.assessed_by_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-white/50">Approved by</p>
            <p className="font-medium">{row.approved_by_name ?? (row.status === 'approved' ? '—' : 'Pending')}</p>
          </div>
        </div>
      </div>

      {showAdminBar ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-sm font-semibold text-[#0B1F45]">Administrator review</h2>
          <p className="mt-1 text-xs text-gray-600">Approve to finalize scores and update the watchlist, or return for revision.</p>
          <div className="mt-4 flex items-start gap-3">
            <input
              id="co"
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-[#0B1F45] focus:ring-[#0B1F45]"
              checked={contractual}
              onChange={(e) => setContractual(e.target.checked)}
            />
            <div>
              <Label htmlFor="co" className="text-sm font-medium text-[#0B1F45]">
                Contractual obligation (locks divest recommendation to freeze where applicable)
              </Label>
              <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy} onClick={() => void onSaveContractual()}>
                Recalculate with this flag
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="ov">Recommendation override reason (optional audit trail)</Label>
            <Textarea
              id="ov"
              className="mt-1"
              rows={2}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Document why contractual or governance factors differ from the model recommendation…"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" className="bg-[#0F8A6E] hover:bg-[#0c6f58]" disabled={busy} onClick={onApprove}>
              {busy ? 'Working…' : 'Approve'}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={onReturn}>
              Return for revision
            </Button>
          </div>
        </section>
      ) : null}

      {readOnly && row.recommendation_override_reason ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Override reason</p>
          <p className="mt-2 text-gray-800">{row.recommendation_override_reason}</p>
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-[#0B1F45]">Original Due Diligence Outcome</h2>
        {row.dd_reference ? (
          <div className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-gray-400">Outcome</p>
              <p className="font-medium capitalize">{(row.dd_reference.recommendation ?? row.dd_outcome_at_commitment ?? '—').replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Score</p>
              <p className="font-medium">{row.dd_reference.score != null ? Number(row.dd_reference.score).toFixed(2) : '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Date</p>
              <p className="font-medium">
                {row.dd_reference.completed_at
                  ? new Date(`${row.dd_reference.completed_at}`).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Reference</p>
              <Link href={`/assessments/${row.dd_reference.id}`} className="font-medium text-[#0F8A6E] underline">
                View original DD assessment
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No completed due diligence assessment is linked to this quarterly assessment.</p>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#0B1F45]">Dimension scores</h2>
        <div className="mt-4">
        {DIMS.map((d) => {
          const sc = row[d.scoreKey];
          const tx = row[d.textKey];
          const r = (dimReasoning[d.key] ?? null) as DimReasoningBlock | null;
          const ov = (dimOverrides[d.key] ?? null) as { score?: number; reason?: string } | null;
          const snippets = (dimSnippets[d.key] ?? []) as string[];
          const factors = r?.factors ?? [];
          const baseScore = r?.base_score ?? 50;
          const totalAdj = totalAdjustmentFromFactors(factors);
          const finalNum = r?.final_score ?? (sc != null ? Number(sc) : null);
          const finalStr = finalNum != null && Number.isFinite(finalNum) ? Number(finalNum).toFixed(1) : '—';
          return (
            <div key={d.label} className="mb-4 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-medium text-gray-900">{d.label}</h3>
                <span className="text-3xl font-medium tabular-nums text-gray-900">{sc != null ? Number(sc).toFixed(1) : '—'}</span>
              </div>
              {ov?.score != null ? (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  Overridden to {ov.score} {ov.reason ? `— ${ov.reason}` : ''}
                </div>
              ) : null}
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
                      <tr key={`${d.key}-${i}`} className="border-b border-gray-50 last:border-0">
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
              {snippets.length ? (
                <div className="mt-2 space-y-1">
                  {snippets.map((s, i) => (
                    <blockquote key={`${d.key}-snip-${i}`} className="border-l-2 border-gray-200 pl-2 text-xs italic text-gray-600">
                      "{s}"
                    </blockquote>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{typeof tx === 'string' && tx.trim() ? tx : '—'}</p>
            </div>
          );
        })}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[#0B1F45]">AI summary</h2>
          {!readOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-sm text-[#0F8A6E] underline disabled:opacity-50"
                disabled={aiBusy || busy}
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
                      const ok = await patch({ ai_summary: row.ai_summary ?? null });
                      if (ok) setEditSummaryManually(false);
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
          ) : row.status === 'approved' ? (
            <div className="flex items-center gap-2">
              <a
                href={`/portfolio/funds/${fundId}/assessments/${row.id}/pctu-preview`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Eye className="h-4 w-4" aria-hidden />
                Preview
              </a>
              <a
                href={`/api/portfolio/funds/${fundId}/assessments/${row.id}/pctu-report`}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#0B1F45] px-3 py-1.5 text-sm text-white hover:bg-[#0B1F45]/90"
              >
                <Download className="h-4 w-4" aria-hidden />
                Download PDF
              </a>
            </div>
          ) : null}
        </div>
        {!readOnly && !row.ai_summary?.trim() && !editSummaryManually ? (
          <div className="mt-3 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p>AI summary generation failed — click Regenerate to retry</p>
            <Button type="button" size="sm" variant="outline" className="shrink-0 border-amber-300" disabled={aiBusy || busy} onClick={() => void regenerateAiSummary()}>
              {aiBusy ? 'Regenerating…' : 'Regenerate'}
            </Button>
          </div>
        ) : null}
        {readOnly ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{row.ai_summary?.trim() ? row.ai_summary : '—'}</p>
        ) : editSummaryManually ? (
          <Textarea className="mt-3" rows={8} value={row.ai_summary ?? ''} onChange={(e) => onAiSummaryLocalChange(e.target.value)} />
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{row.ai_summary?.trim() ? row.ai_summary : '—'}</p>
        )}
        {row.ai_generated_at ? <p className="mt-2 text-xs text-gray-400">Generated {row.ai_generated_at}</p> : null}
      </section>
    </div>
  );
}
