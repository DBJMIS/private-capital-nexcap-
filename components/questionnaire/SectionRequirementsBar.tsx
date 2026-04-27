'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

import type { DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import { getRequirementItems } from '@/lib/questionnaire/get-requirement-items';
import { cn } from '@/lib/utils';

export type SectionRequirementsBarProps = {
  sectionKey: DdSectionKey;
  answers: Record<string, unknown>;
  documents: DdDocumentRow[];
  sectionStatus: string;
  /** Whole questionnaire is submitted (`vc_dd_questionnaires.status`). */
  questionnaireSubmitted?: boolean;
  /** Server validation messages from POST /complete (e.g. 400 details). */
  completionErrors?: string[];
};

type OpenSource = 'auto' | 'user';

export function SectionRequirementsBar({
  sectionKey,
  answers,
  documents,
  sectionStatus,
  questionnaireSubmitted = false,
  completionErrors = [],
}: SectionRequirementsBarProps) {
  const { items, allSatisfied, satisfiedCount, totalCount } = useMemo(
    () => getRequirementItems({ sectionKey, answers, documents }),
    [sectionKey, answers, documents],
  );

  const statusLower = sectionStatus.toLowerCase().replace(/\s+/g, '_');
  const sectionCompleted = statusLower === 'completed';
  const showCompletePill = sectionCompleted || allSatisfied;

  const allSatisfiedRef = useRef(allSatisfied);
  const sectionCompletedRef = useRef(sectionCompleted);
  allSatisfiedRef.current = allSatisfied;
  sectionCompletedRef.current = sectionCompleted;

  const [popoverOpen, setPopoverOpen] = useState(false);
  const openSourceRef = useRef<OpenSource | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const autoOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unsatisfiedCount = totalCount - satisfiedCount;
  const hasServerCompletionIssues = completionErrors.length > 0;

  const closePopover = useCallback(() => {
    setPopoverOpen(false);
    openSourceRef.current = null;
  }, []);

  /** Auto-open once per section visit (not on every requirement toggle). */
  useEffect(() => {
    if (autoOpenTimerRef.current) {
      clearTimeout(autoOpenTimerRef.current);
      autoOpenTimerRef.current = null;
    }
    closePopover();

    autoOpenTimerRef.current = setTimeout(() => {
      autoOpenTimerRef.current = null;
      if (sectionCompletedRef.current) return;
      if (allSatisfiedRef.current) return;
      setPopoverOpen(true);
      openSourceRef.current = 'auto';
    }, 1000);

    return () => {
      if (autoOpenTimerRef.current) {
        clearTimeout(autoOpenTimerRef.current);
        autoOpenTimerRef.current = null;
      }
    };
  }, [sectionKey, closePopover]);

  useEffect(() => {
    if (!showCompletePill || !popoverOpen) return;
    if (openSourceRef.current === 'user') return;
    closePopover();
  }, [showCompletePill, popoverOpen, closePopover]);

  useEffect(() => {
    if (completionErrors.length === 0) return;
    setPopoverOpen(true);
    openSourceRef.current = 'user';
  }, [completionErrors]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const t = e.target;
      if (t instanceof Node && !el.contains(t)) closePopover();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [popoverOpen, closePopover]);

  const onPillClick = () => {
    if (showCompletePill) return;
    if (popoverOpen) return;
    setPopoverOpen(true);
    openSourceRef.current = 'user';
  };

  const progressPct =
    totalCount > 0 ? Math.round((satisfiedCount / totalCount) * 100) : allSatisfied ? 100 : 0;

  return (
    <div ref={rootRef} className="relative shrink-0">
      {showCompletePill ? (
        <span
          className={cn(
            'inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-[#0F8A6E]',
          )}
        >
          {questionnaireSubmitted
            ? '✓ Questionnaire submitted'
            : sectionCompleted
              ? '✓ Section complete'
              : '✓ Ready to complete'}
        </span>
      ) : (
        <button
          type="button"
          onClick={onPillClick}
          className={cn(
            'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700',
            'cursor-pointer hover:bg-amber-100',
          )}
        >
          ⚠ {unsatisfiedCount} remaining
        </button>
      )}

      {popoverOpen ? (
        <div
          className="absolute right-0 top-8 z-40 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
          role="dialog"
          aria-label="Section requirements"
        >
          <div
            className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white"
            aria-hidden
          />
          <div className="relative">
            <h3 className="mb-3 text-sm font-semibold text-[#0B1F45]">Section requirements</h3>
            <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[#0F8A6E] transition-[width]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mb-3 text-xs text-gray-500">
              {satisfiedCount} of {totalCount} complete
            </p>
            <ul className="max-h-64 space-y-0 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 py-1.5">
                  {item.satisfied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F8A6E]" aria-hidden />
                      <span className="text-sm text-gray-400">{item.label}</span>
                    </>
                  ) : (
                    <>
                      <Circle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                      <span className="text-sm font-medium text-gray-800">{item.label}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {hasServerCompletionIssues ? (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="text-xs text-amber-600">
                  ⚠ Some items need attention before this section can be marked complete
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
