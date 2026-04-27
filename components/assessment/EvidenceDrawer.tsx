'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

import { EvidencePanel } from '@/components/assessment/EvidencePanel';
import type { QuestionnaireBundle } from '@/lib/assessment/questionnaire-bundle';
import type { CriteriaKey } from '@/lib/scoring/config';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EvidenceDrawerProps = {
  open: boolean;
  onClose: () => void;
  criteriaKey: CriteriaKey;
  criteriaTitle: string;
  bundle: QuestionnaireBundle;
  questionnaireId: string | null;
};

/** DOM id for `aria-controls` on the “View evidence” control. */
export const ASSESSMENT_EVIDENCE_DRAWER_DOM_ID = 'assessment-evidence-drawer';

export function EvidenceDrawer({ open, onClose, criteriaKey, criteriaTitle, bundle, questionnaireId }: EvidenceDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const closeBtn = panelRef.current?.querySelector<HTMLElement>('[data-drawer-close]');
    closeBtn?.focus();
  }, [open]);

  return (
    <div
      className={cn('fixed inset-0 z-40', open ? 'pointer-events-auto' : 'pointer-events-none')}
      aria-hidden={!open}
    >
      {open ? (
        <button
          type="button"
          className="absolute inset-0 bg-black/20"
          aria-label="Close evidence drawer"
          tabIndex={-1}
          onClick={onClose}
        />
      ) : null}

      <div
        id={ASSESSMENT_EVIDENCE_DRAWER_DOM_ID}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute inset-y-0 right-0 flex w-80 max-w-[100vw] flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 px-4 pb-3 pt-4">
          <div className="min-w-0 pr-2">
            <h2 id={titleId} className="text-sm font-semibold text-[#0B1F45]">
              Questionnaire evidence
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">{criteriaTitle}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-gray-600 hover:bg-gray-100"
            data-drawer-close
            aria-label="Close evidence drawer"
            tabIndex={open ? 0 : -1}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <EvidencePanel
            criteriaKey={criteriaKey}
            bundle={bundle}
            questionnaireId={questionnaireId}
            hideHeader
          />
        </div>
      </div>
    </div>
  );
}
