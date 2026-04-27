'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

import { EntityActivitySection } from '@/components/audit/EntityActivitySection';

import { ASSESSMENT_CRITERIA, CRITERIA_ORDER, type CriteriaKey } from '@/lib/scoring/config';
import { SubcriteriaRow } from '@/components/assessment/SubcriteriaRow';
import { Button } from '@/components/ui/button';
import { CriteriaNav } from '@/components/assessment/CriteriaNav';
import { ASSESSMENT_EVIDENCE_DRAWER_DOM_ID, EvidenceDrawer } from '@/components/assessment/EvidenceDrawer';
import type { AiSubcriteriaEntry } from '@/lib/assessment/dd-ai-assess-prompt';
import type { QuestionnaireBundle } from '@/lib/assessment/questionnaire-bundle';
import { getAiSubcriteriaSuggestion, parseAiSuggestionStore } from '@/lib/assessment/ai-suggestion-utils';
import { cn } from '@/lib/utils';
import type { SubcriteriaState } from '@/components/assessment/CriteriaTab';

export function AssessmentWorkspace({
  questionnaireId,
  bundle,
  aiOverall,
  aiRaw,
  locked,
  editable,
  state,
  onCellChange,
  saveSection,
  saving,
  scoredSubCount: _scoredSubCount,
  totalSubs: _totalSubs,
  activityAssessmentId,
}: {
  questionnaireId: string | null;
  bundle: QuestionnaireBundle;
  aiOverall: string | null;
  aiRaw: unknown;
  locked: boolean;
  editable: boolean;
  state: Record<CriteriaKey, SubcriteriaState>;
  onCellChange: (criteriaKey: CriteriaKey, subKey: string, patch: { score: number | null; notes: string }) => void;
  saveSection: (key: CriteriaKey) => Promise<void>;
  saving: boolean;
  scoredSubCount: number;
  totalSubs: number;
  /** When set, renders collapsible activity below the scoring column. */
  activityAssessmentId: string;
}) {
  const aiStore = useMemo(() => parseAiSuggestionStore(aiRaw), [aiRaw]);
  const [active, setActive] = useState<CriteriaKey>('firm');
  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(new Set());
  const [activityOpen, setActivityOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  useEffect(() => {
    setAcceptedKeys(new Set());
  }, [aiRaw]);

  const activeIndex = CRITERIA_ORDER.indexOf(active);
  const def = ASSESSMENT_CRITERIA.find((c) => c.key === active)!;
  const maxPts = def.subcriteria.reduce((s, x) => s + x.maxPoints, 0);
  let sectionPts = 0;
  let scoredInSection = 0;
  for (const sc of def.subcriteria) {
    const row = state[active][sc.key];
    if (row?.score != null && !Number.isNaN(Number(row.score))) {
      sectionPts += Number(row.score);
      scoredInSection += 1;
    }
  }
  const sectionRatio = maxPts > 0 ? sectionPts / maxPts : 0;
  const headerScoreClass =
    scoredInSection === 0 ? 'text-gray-300' : sectionRatio >= 0.8 ? 'text-[#0F8A6E]' : sectionRatio >= 0.6 ? 'text-amber-600' : 'text-red-500';

  const getSuggestion = (ck: CriteriaKey, sk: string): AiSubcriteriaEntry | null =>
    getAiSubcriteriaSuggestion(aiStore, ck, sk);

  return (
    <div className="grid w-full grid-cols-[200px_minmax(0,1fr)] items-stretch border-t border-gray-200 bg-white">
      <div className="flex flex-col border-r border-gray-200 bg-white">
        <CriteriaNav active={active} onSelect={setActive} state={state} />
      </div>

      <div className="relative flex min-w-0 flex-col bg-[#F3F4F6]">
        <div className="space-y-4 px-6 py-5 pb-28">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setEvidenceOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700"
              aria-expanded={evidenceOpen}
              aria-controls={ASSESSMENT_EVIDENCE_DRAWER_DOM_ID}
            >
              View evidence — {def.title}
              <span aria-hidden>→</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0B1F45] bg-white px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-[#0B1F45]">{def.title}</h2>
              <p className="text-sm text-gray-400">({def.weightPercent}% weight)</p>
            </div>
            <div className="text-right">
              <p className={cn('text-xl font-bold tabular-nums', headerScoreClass)}>
                {sectionPts} / {maxPts} pts
              </p>
              <p className="text-xs text-gray-400">
                {scoredInSection} of {def.subcriteria.length} scored
              </p>
            </div>
          </div>

          {aiOverall ? (
            <div className="flex gap-2 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-800">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" aria-hidden />
              <p className="leading-relaxed">{aiOverall}</p>
            </div>
          ) : null}

          {def.subcriteria.map((sc) => {
            const row = state[active][sc.key] ?? { score: null, notes: '' };
            const sug = getSuggestion(active, sc.key);
            const keyId = `${active}:${sc.key}`;
            const accepted = acceptedKeys.has(keyId);
            const differs =
              sug != null &&
              row.score != null &&
              Math.round(Number(row.score)) !== Math.round(Number(sug.suggested_score));
            return (
              <SubcriteriaRow
                key={sc.key}
                label={sc.label}
                maxPoints={sc.maxPoints}
                score={row.score}
                notes={row.notes}
                disabled={!editable}
                aiSuggestion={sug}
                aiAccepted={accepted}
                aiDiffers={Boolean(differs)}
                onAcceptAi={() => {
                  if (!sug) return;
                  const clamped = Math.min(sc.maxPoints, Math.max(0, Math.round(Number(sug.suggested_score))));
                  onCellChange(active, sc.key, { score: clamped, notes: row.notes });
                  setAcceptedKeys((prev) => new Set(prev).add(keyId));
                }}
                onOverride={() => {
                  setAcceptedKeys((prev) => {
                    const n = new Set(prev);
                    n.delete(keyId);
                    return n;
                  });
                }}
                onChange={(patch) => onCellChange(active, sc.key, patch)}
                weightedPreview={
                  row.score != null && !Number.isNaN(Number(row.score))
                    ? `Contribution to overall (this line, section complete): +${((Number(row.score) / maxPts) * def.weightPercent).toFixed(2)} pts`
                    : null
                }
              />
            );
          })}

          {activityAssessmentId ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setActivityOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
                aria-expanded={activityOpen}
              >
                <span className="text-sm font-semibold text-[#0B1F45]">Activity</span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200', activityOpen && 'rotate-180')}
                  aria-hidden
                />
              </button>
              {activityOpen ? (
                <div className="max-h-[min(28rem,50vh)] overflow-y-auto border-t border-gray-100 bg-[#F3F4F6] px-4 py-4">
                  <EntityActivitySection
                    entityType="assessment"
                    entityId={activityAssessmentId}
                    className="mt-0 rounded-lg border border-gray-200 bg-white p-4 shadow-none [&>h3]:hidden [&>p]:hidden"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-gray-100 bg-white px-6 py-3">
          <span className="text-sm text-gray-600 tabular-nums">
            Section {activeIndex + 1} of {CRITERIA_ORDER.length}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activeIndex <= 0}
              onClick={() => setActive(CRITERIA_ORDER[activeIndex - 1]!)}
              className="gap-1 border-gray-300 bg-white shadow-none hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              ← Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!editable || saving}
              onClick={() => void saveSection(active)}
              className="min-w-[9rem] border-gray-300 bg-white shadow-none hover:bg-gray-50"
            >
              {saving ? 'Saving…' : 'Save section'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activeIndex >= CRITERIA_ORDER.length - 1}
              onClick={() => setActive(CRITERIA_ORDER[activeIndex + 1]!)}
              className="gap-1 border-gray-300 bg-white shadow-none hover:bg-gray-50"
            >
              Next →
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        <EvidenceDrawer
          open={evidenceOpen}
          onClose={() => setEvidenceOpen(false)}
          criteriaKey={active}
          criteriaTitle={def.title}
          bundle={bundle}
          questionnaireId={questionnaireId}
        />
      </div>
    </div>
  );
}
