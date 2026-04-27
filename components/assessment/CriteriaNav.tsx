'use client';

import { ASSESSMENT_CRITERIA, CRITERIA_ORDER, type CriteriaKey } from '@/lib/scoring/config';
import type { SubcriteriaState } from '@/components/assessment/CriteriaTab';
import { cn } from '@/lib/utils';
import { previewOverallWeighted } from '@/lib/scoring/calculate';

function sectionScoreColor(sectionPts: number, maxPts: number, scoredCount: number): string {
  if (scoredCount === 0 || maxPts <= 0) return 'text-gray-300';
  const ratio = sectionPts / maxPts;
  if (ratio >= 0.8) return 'text-[#0F8A6E]';
  if (ratio >= 0.6) return 'text-amber-600';
  return 'text-red-500';
}

export function CriteriaNav({
  active,
  onSelect,
  state,
}: {
  active: CriteriaKey;
  onSelect: (k: CriteriaKey) => void;
  state: Record<CriteriaKey, SubcriteriaState>;
}) {
  const preview = previewOverallWeighted(state);

  return (
    <nav className="flex flex-col bg-white" aria-label="Assessment criteria">
      <p className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Criteria</p>
      {CRITERIA_ORDER.map((key) => {
        const def = ASSESSMENT_CRITERIA.find((c) => c.key === key)!;
        const maxPts = def.subcriteria.reduce((s, sc) => s + sc.maxPoints, 0);
        let sectionPts = 0;
        let scoredCount = 0;
        for (const sc of def.subcriteria) {
          const v = state[key][sc.key]?.score;
          if (v != null && !Number.isNaN(Number(v))) {
            sectionPts += Number(v);
            scoredCount += 1;
          }
        }
        const isActive = active === key;
        const scoreDisplay = scoredCount > 0 ? sectionPts : '—';
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              'flex w-full items-center justify-between border-b border-gray-100 py-3 pl-4 pr-3 text-left transition-colors hover:bg-[#F8F9FF]',
              isActive ? 'border-l-4 border-l-[#0B1F45] bg-[#F8F9FF]' : 'border-l-4 border-l-transparent',
            )}
          >
            <div className="min-w-0">
              <div
                className={cn(
                  'text-xs font-semibold uppercase tracking-wide',
                  isActive ? 'text-[#0B1F45]' : 'text-gray-700',
                )}
              >
                {def.title}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {scoredCount}/{def.subcriteria.length} scored
              </div>
              <div className="mt-0.5 text-xs text-gray-400">{def.weightPercent}% weight</div>
            </div>
            <div className="ml-2 shrink-0 text-right">
              <div className={cn('text-sm font-bold tabular-nums', sectionScoreColor(sectionPts, maxPts, scoredCount))}>
                {scoreDisplay}
              </div>
              <div className="text-xs text-gray-300">/{maxPts}</div>
            </div>
          </button>
        );
      })}
      <div className="bg-gray-50 mx-3 mt-6 rounded-lg p-3 text-center">
        <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">Live score</p>
        <p className="text-2xl font-medium text-gray-900 tabular-nums">{preview.toFixed(1)}</p>
        <p className="text-xs text-gray-400">of 100</p>
      </div>
    </nav>
  );
}
