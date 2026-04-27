'use client';

import { Sparkles } from 'lucide-react';

import { AIInsightsPanel } from '@/components/assessment/AIInsightsPanel';
import { InsightsPanel } from '@/components/assessment/InsightsPanel';
import { OutcomeBadge, type OutcomeBand } from '@/components/assessment/OutcomeBadge';
import { ASSESSMENT_CRITERIA, CRITERIA_ORDER, PASS_THRESHOLD, type CriteriaKey } from '@/lib/scoring/config';
import type { SubcriteriaState } from '@/components/assessment/CriteriaTab';
import { cn } from '@/lib/utils';

function bandScoreClass(band: OutcomeBand): string {
  if (band === 'strong' || band === 'adequate') return 'text-[#0F8A6E]';
  if (band === 'weak') return 'text-amber-600';
  return 'text-red-600';
}

export function AssessmentInsightsDashboard({
  assessmentId,
  assessmentComplete,
  canUseNarrative,
  rawNarrative,
  onRefresh,
  displayScore,
  outcomeBand,
  outcomeLabel,
  recommendationLabel,
  aiOverallDd,
  state,
}: {
  assessmentId: string;
  assessmentComplete: boolean;
  canUseNarrative: boolean;
  rawNarrative: unknown;
  onRefresh: () => Promise<void>;
  displayScore: number;
  outcomeBand: OutcomeBand;
  outcomeLabel: string;
  recommendationLabel: string;
  aiOverallDd: string | null;
  state: Record<CriteriaKey, SubcriteriaState>;
}) {
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50 px-6 py-5">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-3 md:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Overall score</p>
            <p className={cn('text-5xl font-black tabular-nums', bandScoreClass(outcomeBand))}>
              {displayScore.toFixed(1)}
              <span className="text-2xl font-bold text-gray-400">/100</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">Pass threshold: {PASS_THRESHOLD}</p>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={cn('h-full rounded-full transition-all', displayScore >= PASS_THRESHOLD ? 'bg-[#0F8A6E]' : 'bg-amber-500')}
                style={{ width: `${Math.min(100, Math.max(0, displayScore))}%` }}
              />
            </div>
            <p className="text-center text-[10px] text-gray-400">
              Preview vs 100 · Pass threshold {PASS_THRESHOLD}
            </p>
          </div>
          <div className="flex justify-center md:justify-end">
            <OutcomeBadge band={outcomeBand} label={outcomeLabel} recommendationLabel={recommendationLabel} />
          </div>
        </div>
      </div>

      {aiOverallDd ? (
        <div className="flex gap-2 rounded-xl bg-indigo-50 p-5 text-sm leading-relaxed text-indigo-800">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" aria-hidden />
          <p>{aiOverallDd}</p>
        </div>
      ) : null}

      <InsightsPanel assessmentId={assessmentId} variant="columns" />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Criteria</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Max</th>
              <th className="px-4 py-3">%</th>
            </tr>
          </thead>
          <tbody>
            {CRITERIA_ORDER.map((key) => {
              const def = ASSESSMENT_CRITERIA.find((c) => c.key === key)!;
              const maxPts = def.subcriteria.reduce((s, sc) => s + sc.maxPoints, 0);
              let sum = 0;
              let complete = true;
              for (const sc of def.subcriteria) {
                const v = state[key][sc.key]?.score;
                if (v == null || Number.isNaN(Number(v))) {
                  complete = false;
                  break;
                }
                sum += Number(v);
              }
              const p = complete && maxPts > 0 ? pct(sum, maxPts) : null;
              return (
                <tr key={key} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{def.title}</td>
                  <td className="px-4 py-2.5 text-gray-600">{def.weightPercent}%</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-800">{complete ? sum : '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-500">{maxPts}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-600">{p != null ? `${p}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Post-completion narrative</p>
        <p className="mt-1 text-xs text-gray-400">Edit and regenerate structured AI insights once the assessment is completed.</p>
        <div className="mt-4">
          <AIInsightsPanel
            assessmentId={assessmentId}
            isUnlocked={assessmentComplete}
            rawNarrative={rawNarrative}
            onRefresh={onRefresh}
            canUse={canUseNarrative}
          />
        </div>
      </div>
    </div>
  );
}
