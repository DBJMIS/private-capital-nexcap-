'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QuestionField } from '@/components/questionnaire/QuestionField';
import type { StaffBioFormRow } from '@/components/questionnaire/StaffBioForm';
import type { DdDocumentRow } from '@/components/questionnaire/DocumentUpload';
import { createQuestionnaireAutosave } from '@/lib/questionnaire/auto-save';
import type { DdSectionKey, QuestionDef, SectionMeta } from '@/lib/questionnaire/types';
import { useQuestionnaireShell } from '@/components/questionnaire/QuestionnaireContext';
import { normalizeContactPersonsValue } from '@/lib/questionnaire/contact-persons';
import { extractStructuredListsPayload, filterPersistableAnswers } from '@/lib/questionnaire/section-persist-split';
import { canMarkSectionComplete } from '@/lib/questionnaire/can-mark-section-complete';
import { getSectionConfig } from '@/lib/questionnaire/questions-config';
import { getSectionLayoutGroups } from '@/lib/questionnaire/section-layout';
import { QuestionnaireGroupCard } from '@/components/questionnaire/QuestionnaireGroupCard';
import { SponsorAlignmentCompensationGroup } from '@/components/questionnaire/SponsorAlignmentCompensationGroup';
import { SponsorConflictsLegalGroup } from '@/components/questionnaire/SponsorConflictsLegalGroup';
import { SPONSOR_ALIGNMENT_LAYOUT_SENTINEL } from '@/lib/questionnaire/sponsor-alignment-bundle';
import { SPONSOR_CONFLICTS_LEGAL_LAYOUT_SENTINEL } from '@/lib/questionnaire/sponsor-conflicts-legal-bundle';
import { mapStaffBiosFromApi, type StaffBioApiRow } from '@/lib/questionnaire/staff-bio-form-map';
import { staffBioFormRowToInput } from '@/lib/questionnaire/staff-bio-input';
import type { StaffBioInput } from '@/lib/questionnaire/validate';
import { cn } from '@/lib/utils';
import { SectionRequirementsBar } from '@/components/questionnaire/SectionRequirementsBar';

type SectionPayload = {
  section: { id: string; status: string; section_key: string };
  config: SectionMeta;
  answers: Record<string, unknown>;
  documents: DdDocumentRow[];
  staff_bio_link_options?: Array<{ id: string; full_name: string }>;
  staff_bios_snapshot?: StaffBioApiRow[];
};

function sectionStatusForStatusBadge(sectionStatus: string): string {
  const s = sectionStatus.toLowerCase().replace(/\s+/g, '_');
  if (s === 'not_started') return 'not_started';
  if (s === 'draft') return 'draft';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'completed') return 'completed';
  return s;
}

export type QuestionnaireSectionPanelHandle = {
  flushSave: () => Promise<void>;
};

type PanelProps = {
  sectionKey: DdSectionKey;
  onPrev: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  canPrev: boolean;
  canNext: boolean;
  isLastSection: boolean;
};

export const QuestionnaireSectionPanel = forwardRef<QuestionnaireSectionPanelHandle, PanelProps>(
  function QuestionnaireSectionPanel({ sectionKey, onPrev, onNext, canPrev, canNext, isLastSection }, ref) {
    const router = useRouter();
    const {
      questionnaireId,
      basePath,
      questionnaireStatus,
      sections: shellSections,
      actorRole,
      refresh: refreshShell,
      updateSectionStatus,
      setAiSurface,
    } = useQuestionnaireShell();
    const [payload, setPayload] = useState<SectionPayload | null>(null);
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [sponsorStaffBios, setSponsorStaffBios] = useState<StaffBioFormRow[]>([]);
    const [documents, setDocuments] = useState<DdDocumentRow[]>([]);
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [actionErr, setActionErr] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [saveUi, setSaveUi] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [footerBusy, setFooterBusy] = useState(false);
    const [completionErrors, setCompletionErrors] = useState<string[]>([]);
    const [listHydrationEpoch, setListHydrationEpoch] = useState(0);
    /** True when local edits may not be persisted yet; drives skip-redundant flushSave. */
    const isDirtyRef = useRef(false);
    const autosaveRef = useRef<ReturnType<typeof createQuestionnaireAutosave> | null>(null);
    const answersRef = useRef(answers);
    const documentsRef = useRef(documents);
    const payloadRef = useRef<SectionPayload | null>(null);
    const sponsorStaffBiosRef = useRef(sponsorStaffBios);
    const sectionKeyRef = useRef(sectionKey);
    const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadRequestRef = useRef(0);
    /** Last section key we successfully loaded into `payload` (avoids clearing payload on same-section reload after save/autosave). */
    const lastLoadedSectionKeyRef = useRef<string | null>(null);
    /** Latest read-only flag for async callbacks (autosave / completion check). */
    const interactionsDisabledRef = useRef(false);
    answersRef.current = answers;
    sponsorStaffBiosRef.current = sponsorStaffBios;
    sectionKeyRef.current = sectionKey;

    useEffect(() => {
      documentsRef.current = documents;
      payloadRef.current = payload;
    }, [documents, payload]);

    const questionnaireSubmitted =
      String(questionnaireStatus ?? '')
        .toLowerCase()
        .replace(/\s+/g, '_') === 'completed';
    const shellSection = shellSections.find((s) => s.section_key === sectionKey);
    const sectionMarkedComplete =
      String(shellSection?.status ?? '')
        .toLowerCase()
        .replace(/\s+/g, '_') === 'completed';
    const disabled =
      questionnaireSubmitted || (sectionMarkedComplete && actorRole !== 'admin');
    interactionsDisabledRef.current = disabled;

    const load = useCallback(async () => {
      const loadId = ++loadRequestRef.current;
      const requestedSection = sectionKey;
      if (lastLoadedSectionKeyRef.current !== requestedSection) {
        setPayload(null);
      }
      setLoadErr(null);
      const res = await fetch(`/api/questionnaires/${questionnaireId}/sections/${sectionKey}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as SectionPayload & { error?: string };
      // Ignore stale responses from previous section loads.
      if (loadId !== loadRequestRef.current || sectionKeyRef.current !== requestedSection) return;
      if (!res.ok) {
        setLoadErr(json.error ?? 'Failed to load section');
        setPayload(null);
        return;
      }
      setPayload(json as SectionPayload);
      lastLoadedSectionKeyRef.current = requestedSection;
      const rawAnswers = (json.answers ?? {}) as Record<string, unknown>;
      const mergedAnswers =
        sectionKey === 'basic_info'
          ? { ...rawAnswers, contact_persons: normalizeContactPersonsValue(rawAnswers.contact_persons) }
          : rawAnswers;
      const sectionCfg = getSectionConfig(requestedSection)!;
      const allowedAnswerKeys = new Set(sectionCfg.questions.map((q) => q.key));
      setAnswers((prev) => {
        const fromServer = mergedAnswers;
        const out: Record<string, unknown> = { ...fromServer };
        // Include `answersRef` keys: `onAnswerChange` updates the ref synchronously but `prev`
        // can lag if this merge runs before React commits the latest keystroke (e.g. after save reload).
        const refSnap = answersRef.current;
        const keyPool = new Set([
          ...Object.keys(fromServer),
          ...Object.keys(prev),
          ...Object.keys(refSnap),
        ]);
        for (const k of keyPool) {
          if (!allowedAnswerKeys.has(k)) continue;
          if (
            !(k in out) ||
            out[k] === undefined ||
            out[k] === null
          ) {
            const fromRef = refSnap[k];
            const fromPrev = prev[k];
            const pick =
              fromRef !== undefined && fromRef !== null
                ? fromRef
                : fromPrev !== undefined && fromPrev !== null
                  ? fromPrev
                  : undefined;
            if (pick !== undefined && pick !== null) {
              out[k] = pick;
            }
          }
        }
        return out;
      });
      setSponsorStaffBios(
        sectionKey === 'sponsor' ? mapStaffBiosFromApi((json.staff_bios_snapshot ?? []) as StaffBioApiRow[]) : [],
      );
      setDocuments((json.documents ?? []) as DdDocumentRow[]);
      setListHydrationEpoch((e) => e + 1);
    }, [questionnaireId, sectionKey]);

    useEffect(() => {
      void load();
    }, [load]);

    useEffect(() => {
      setLastSavedAt(null);
      setSaveUi('idle');
      setActionErr(null);
      setCompletionErrors([]);
      setListHydrationEpoch(0);
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    }, [sectionKey]);

    useEffect(() => {
      if (!payload || payload.section.section_key !== sectionKey) return;
      setAiSurface({
        sectionKey,
        sectionTitle: payload.config.title,
        currentAnswers: answers,
      });
    }, [payload, sectionKey, answers, setAiSurface]);

    const putSponsorDirect = useCallback(
      async (body: {
        answers: Record<string, unknown>;
        structured_lists: Record<string, unknown>;
        staff_bios_upserts: StaffBioInput[];
      }) => {
        const res = await fetch(`/api/questionnaires/${questionnaireId}/sections/sponsor/answers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? 'Save failed');
        }
        return (await res.json()) as { staff_bio_upsert_ids?: string[]; ok?: boolean };
      },
      [questionnaireId],
    );

    const scheduleCompletionCheck = useCallback(() => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      completionTimerRef.current = setTimeout(() => {
        completionTimerRef.current = null;
        void (async () => {
          if (interactionsDisabledRef.current) return;
          const sk = sectionKeyRef.current;
          const pl = payloadRef.current;
          if (!pl || pl.section.section_key !== sk) return;
          const currentStatus = pl.section.status;
          if (currentStatus === 'completed') {
            updateSectionStatus(sk, 'completed');
            return;
          }
          const docs = documentsRef.current;
          const ans = answersRef.current;
          const canComplete = canMarkSectionComplete({
            sectionKey: sk,
            answers: ans,
            documents: docs,
          });
          try {
            if (canComplete) {
              const res = await fetch(`/api/questionnaires/${questionnaireId}/sections/${sk}/complete`, {
                method: 'POST',
              });
              if (res.ok) {
                updateSectionStatus(sk, 'completed');
                await load();
                await refreshShell();
                // Shell refresh replaces workspace state; re-apply so a stale GET cannot leave the stepper behind.
                updateSectionStatus(sk, 'completed');
                setCompletionErrors([]);
              } else {
                const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
                console.warn('[AutoComplete] Section', sk, 'failed to complete:', body?.error, body?.details);
                if (body?.details && Array.isArray(body.details)) {
                  setCompletionErrors(body.details);
                }
              }
            }
          } catch {
            /* ignore */
          }
        })();
      }, 500);
    }, [questionnaireId, load, refreshShell, updateSectionStatus]);

    const persist = useCallback(
      async (opts?: { reload?: boolean }) => {
        if (disabled) return;
        const fullAnswers = answersRef.current;
        const structuredLists = extractStructuredListsPayload(sectionKey, fullAnswers);
        const sectionUsesStructuredListsPayload =
          sectionKey === 'basic_info' ||
          sectionKey === 'investors_fundraising' ||
          sectionKey === 'deal_flow' ||
          sectionKey === 'investment_strategy' ||
          sectionKey === 'legal';
        const body = {
          answers: filterPersistableAnswers(sectionKey, fullAnswers),
          ...(sectionKey === 'sponsor'
            ? {
                structured_lists: structuredLists,
                staff_bios_upserts: sponsorStaffBiosRef.current.map(staffBioFormRowToInput),
              }
            : sectionUsesStructuredListsPayload && structuredLists != null
              ? { structured_lists: structuredLists }
              : {}),
        };
        setSaveUi('saving');
        try {
          const res = await fetch(`/api/questionnaires/${questionnaireId}/sections/${sectionKey}/answers`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? 'Save failed');
          }
          setLastSavedAt(new Date());
          setSaveUi('saved');
          isDirtyRef.current = false;
          if (opts?.reload ?? true) {
            await load();
          }
          await refreshShell();
          scheduleCompletionCheck();
        } catch (e) {
          setSaveUi('error');
          throw e;
        }
      },
      [questionnaireId, sectionKey, load, refreshShell, scheduleCompletionCheck, disabled],
    );

    useEffect(() => {
      autosaveRef.current?.dispose();
      autosaveRef.current = null;
      if (disabled) {
        return () => {
          autosaveRef.current?.dispose();
          autosaveRef.current = null;
        };
      }
      autosaveRef.current = createQuestionnaireAutosave(() => persist(), 2000, 30000);
      return () => {
        autosaveRef.current?.dispose();
        autosaveRef.current = null;
      };
    }, [persist, disabled]);

    useImperativeHandle(
      ref,
      () => ({
        flushSave: async () => {
          if (interactionsDisabledRef.current) return;
          if (!isDirtyRef.current) return;
          try {
            await persist({ reload: false });
          } catch {
            /* ignore flush errors on navigate */
          }
        },
      }),
      [persist],
    );

    const markDirty = useCallback(() => {
      isDirtyRef.current = true;
    }, []);

    const touchAutosave = useCallback(() => {
      autosaveRef.current?.touch();
    }, []);

    const onAnswerChange = (key: string, value: unknown) => {
      if (interactionsDisabledRef.current) return;
      markDirty();
      answersRef.current = { ...answersRef.current, [key]: value };
      setAnswers((prev) => ({ ...prev, [key]: value }));
      touchAutosave();
    };

    const handlePrev = async () => {
      if (!canPrev || footerBusy) return;
      setFooterBusy(true);
      try {
        await onPrev();
      } finally {
        setFooterBusy(false);
      }
    };

    const handleNextOrFinish = async () => {
      if (footerBusy || disabled) return;
      setActionErr(null);
      setFooterBusy(true);
      try {
        if (isDirtyRef.current) {
          await persist({ reload: false });
        }
        if (isLastSection) {
          const sk = sectionKeyRef.current;
          const completeRes = await fetch(
            `/api/questionnaires/${questionnaireId}/sections/${sk}/complete`,
            { method: 'POST' },
          );
          if (!completeRes.ok) {
            const body = (await completeRes.json().catch(() => ({}))) as { error?: string; details?: string[] };
            setActionErr(body.error ?? 'Could not complete this section');
            return;
          }
          const meta = await refreshShell();
          const qStatus = String(meta?.questionnaire?.status ?? '').toLowerCase();
          const qnDone = meta?.all_sections_complete === true || qStatus === 'completed';
          if (qnDone) {
            router.push(`${basePath}/${questionnaireId}/complete`);
          } else {
            router.push(`${basePath}/${questionnaireId}`);
          }
          router.refresh();
        } else {
          await onNext();
        }
      } catch (e) {
        setActionErr(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setFooterBusy(false);
      }
    };

    const refetchDocs = useCallback(async () => {
      await load();
    }, [load]);

    const layoutGroups = useMemo(() => {
      if (!payload || payload.section.section_key !== sectionKey) return [];
      return getSectionLayoutGroups(sectionKey, payload.config.questions);
    }, [payload, sectionKey]);

    const questionByKey = useMemo(() => {
      if (!payload || payload.section.section_key !== sectionKey) return new Map<string, QuestionDef>();
      return new Map(payload.config.questions.map((q) => [q.key, q]));
    }, [payload, sectionKey]);

    const payloadMatchesSection =
      payload != null &&
      String(payload.section.section_key).toLowerCase() === String(sectionKey).toLowerCase();

    if (loadErr || !payload || !payloadMatchesSection) {
      return (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-[#0B1F45]">
          {loadErr ?? 'Loading section…'}
        </div>
      );
    }

    const helper = payload.config.helper;

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#F3F4F6]">
        <div className="w-full flex-1 overflow-y-auto px-6 py-8 pb-6">
          <header className="mb-8">
            <div className="relative mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 pr-36 sm:pr-40">
                <h2 className="text-2xl font-bold tracking-tight text-[#0B1F45]">{payload.config.title}</h2>
                <div className="mt-3 h-0.5 w-16 bg-gold" aria-hidden />
                <p className="mt-3 line-clamp-2 text-[13px] leading-snug text-[#6b7280]">{helper}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusBadge status={sectionStatusForStatusBadge(payload.section.status)} />
                </div>
              </div>
              <div className="absolute right-0 top-0 shrink-0">
                <SectionRequirementsBar
                  sectionKey={sectionKey}
                  answers={answers}
                  documents={documents}
                  sectionStatus={payload.section.status}
                  questionnaireSubmitted={questionnaireSubmitted}
                  completionErrors={completionErrors}
                />
              </div>
            </div>
          </header>

          {actionErr && <p className="mb-4 text-sm text-gold-muted">{actionErr}</p>}

          <div className="space-y-6">
              {layoutGroups.map((group) => (
                <QuestionnaireGroupCard key={group.title || 'default'} title={group.title}>
                  <div className="space-y-5 md:space-y-8">
                    {group.rows.map((row, ri) => (
                      <div
                        key={ri}
                        className={cn(
                          'grid gap-x-8 gap-y-5',
                          row.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1',
                        )}
                      >
                        {row.map((key) => {
                          if (sectionKey === 'sponsor' && key === SPONSOR_ALIGNMENT_LAYOUT_SENTINEL) {
                            return (
                              <div key={key} className="min-w-0 md:col-span-2">
                                <SponsorAlignmentCompensationGroup
                                  answers={answers}
                                  onChange={onAnswerChange}
                                  disabled={disabled}
                                />
                              </div>
                            );
                          }
                          if (sectionKey === 'sponsor' && key === SPONSOR_CONFLICTS_LEGAL_LAYOUT_SENTINEL) {
                            return (
                              <div key={key} className="min-w-0 md:col-span-2">
                                <SponsorConflictsLegalGroup
                                  answers={answers}
                                  onChange={onAnswerChange}
                                  disabled={disabled}
                                />
                              </div>
                            );
                          }
                          const q = questionByKey.get(key);
                          if (!q) return null;
                          return (
                            <div key={key} className="min-w-0">
                              <QuestionField
                                questionnaireId={questionnaireId}
                                sectionKey={sectionKey}
                                question={q}
                                value={answers[q.key]}
                                onChange={onAnswerChange}
                                documents={documents}
                                disabled={disabled}
                                listHydrationEpoch={listHydrationEpoch}
                                answersContext={answers}
                                onDocumentsChanged={() => void refetchDocs()}
                                sponsorPersonnel={
                                  sectionKey === 'sponsor'
                                    ? {
                                        questionnaireId,
                                        sectionKey,
                                        documents,
                                        sponsorStaffBios,
                                        onSponsorStaffBiosChange: (rows) => {
                                          if (interactionsDisabledRef.current) return;
                                          markDirty();
                                          setSponsorStaffBios(rows);
                                          touchAutosave();
                                        },
                                        answersSnapshot: answers,
                                        putSponsor: putSponsorDirect,
                                        onDocumentsChanged: () => void refetchDocs(),
                                        onAfterPersist: async () => {
                                          await load();
                                          isDirtyRef.current = false;
                                        },
                                      }
                                    : undefined
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </QuestionnaireGroupCard>
              ))}
            </div>

        </div>

        <footer className="sticky bottom-0 z-20 border-t border-gray-200 bg-white/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" disabled={!canPrev || footerBusy} onClick={() => void handlePrev()}>
              ← Previous
            </Button>
            <div className="order-last w-full text-center text-[12px] text-[#6b7280] sm:order-none sm:w-auto">
              {disabled ? (
                <span className="font-medium text-[#6b7280]">Read-only — changes are not saved.</span>
              ) : footerBusy || saveUi === 'saving' ? (
                <span className="font-medium text-[#374151]">Saving…</span>
              ) : saveUi === 'error' ? (
                <span className="font-medium text-red-600">Save failed</span>
              ) : saveUi === 'saved' && lastSavedAt ? (
                <span className="font-medium text-[#0F8A6E]">Saved ✓</span>
              ) : (
                <span>Changes save automatically while you work.</span>
              )}
            </div>
            <Button
              type="button"
              className="min-w-[10rem] bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90"
              disabled={footerBusy || disabled}
              onClick={() => void handleNextOrFinish()}
            >
              {footerBusy ? 'Saving…' : isLastSection ? 'Finish' : 'Next →'}
            </Button>
          </div>
        </footer>
      </div>
    );
  },
);
QuestionnaireSectionPanel.displayName = 'QuestionnaireSectionPanel';
