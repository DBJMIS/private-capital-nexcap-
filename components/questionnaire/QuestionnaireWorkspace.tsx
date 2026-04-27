'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { type SectionNavItem } from '@/components/questionnaire/SectionNav';
import { QuestionnaireStepperHeader } from '@/components/questionnaire/QuestionnaireStepperHeader';
import { SectionStepper } from '@/components/questionnaire/SectionStepper';
import {
  QuestionnaireProvider,
  type QuestionnaireAiSurface,
} from '@/components/questionnaire/QuestionnaireContext';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import { Button } from '@/components/ui/button';
import { AIAssistant } from '@/components/questionnaire/AIAssistant';
import { SECTION_CONFIGS } from '@/lib/questionnaire/questions-config';
import {
  QuestionnaireSectionPanel,
  type QuestionnaireSectionPanelHandle,
} from '@/components/questionnaire/QuestionnaireSectionPanel';

type Payload = {
  questionnaire: { id: string; status: string; completed_at?: string | null };
  application: { fund_name: string } | null;
  sections: SectionNavItem[];
  actor_role: string;
  progress: { completed_sections: number; total_sections: number };
  all_sections_complete?: boolean;
};

const ORDERED_KEYS: DdSectionKey[] = SECTION_CONFIGS.map((s) => s.key);

function QuestionnaireWorkspaceInner({ questionnaireId }: { questionnaireId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const panelRef = useRef<QuestionnaireSectionPanelHandle>(null);

  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<DdSectionKey | null>(null);
  const initializedRef = useRef(false);
  const [aiSurface, setAiSurfaceState] = useState<QuestionnaireAiSurface>({
    sectionKey: null,
    sectionTitle: null,
    questionKey: null,
    currentAnswers: {},
  });

  const setAiSurface = useCallback((patch: Partial<QuestionnaireAiSurface>) => {
    setAiSurfaceState((s) => ({ ...s, ...patch }));
  }, []);

  const refresh = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/questionnaires/${questionnaireId}`, { cache: 'no-store' });
    const json = (await res.json()) as Payload & { error?: string };
    if (!res.ok) {
      setErr(json.error ?? 'Failed to load');
      setData(null);
      return null;
    }
    const payload = json as Payload;
    setData(payload);
    return {
      questionnaire: payload.questionnaire,
      all_sections_complete: payload.all_sections_complete,
    };
  }, [questionnaireId]);

  const updateSectionStatus = useCallback((key: DdSectionKey, status: string) => {
    setData((d) => {
      if (!d) return d;
      const sections = d.sections.map((s) =>
        s.section_key === key ? { ...s, status } : s,
      );
      const completed_sections = sections.filter(
        (s) => String(s.status ?? '').toLowerCase() === 'completed',
      ).length;
      return {
        ...d,
        sections,
        progress: {
          ...d.progress,
          completed_sections,
        },
      };
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!data) return;

    const q = searchParams.get('section') as DdSectionKey | null;
    const fromUrl = q && ORDERED_KEYS.includes(q) ? q : null;
    const sorted = [...data.sections].sort((a, b) => a.section_order - b.section_order);
    const firstIncomplete = sorted.find((s) => s.status !== 'completed');
    const fallback = firstIncomplete?.section_key ?? sorted[0]?.section_key ?? ORDERED_KEYS[0];
    const desired = fromUrl ?? fallback;

    if (!initializedRef.current) {
      initializedRef.current = true;
      setActiveSection(desired);
      if (!fromUrl) {
        router.replace(`/questionnaires/${questionnaireId}?section=${desired}`, { scroll: false });
      }
      return;
    }

    if (fromUrl && fromUrl !== activeSection) {
      void panelRef.current?.flushSave().then(() => setActiveSection(fromUrl));
    }
  }, [data, searchParams, activeSection, questionnaireId, router]);

  const goToSection = useCallback(
    async (next: DdSectionKey) => {
      if (next === activeSection) return;
      await panelRef.current?.flushSave();
      setActiveSection(next);
      router.replace(`/questionnaires/${questionnaireId}?section=${next}`, { scroll: false });
    },
    [activeSection, questionnaireId, router],
  );

  const idx = useMemo(
    () => (activeSection ? ORDERED_KEYS.indexOf(activeSection) : -1),
    [activeSection],
  );
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < ORDERED_KEYS.length - 1;

  if (err || !data || activeSection === null) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-[#0B1F45]">
        {err ?? 'Loading…'}
        {err && (
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition-colors hover:border-gray-400"
            onClick={() => void refresh()}
          >
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <QuestionnaireProvider
      value={{
        questionnaireId,
        fundName: data.application?.fund_name ?? null,
        questionnaireStatus: data.questionnaire?.status ?? null,
        sections: data.sections,
        completedCount: data.progress.completed_sections,
        totalSections: data.progress.total_sections,
        actorRole: data.actor_role,
        refresh,
        updateSectionStatus,
        aiSurface,
        setAiSurface,
      }}
    >
      <div className="flex min-h-[calc(100vh-3.5rem)] min-w-0 flex-1 flex-col bg-[#F3F4F6]">
        <div className="shrink-0 bg-white">
          <div className="border-b border-gray-100 px-6 py-4">
            <h1 className="text-2xl font-bold text-[#0B1F45]">Questionnaire</h1>
            <p className="mt-1 text-sm text-gray-400">Complete all sections to submit materials for review.</p>
          </div>
          {String(data.questionnaire?.status ?? '')
            .toLowerCase()
            .replace(/\s+/g, '_') === 'completed' ? (
            <div className="border-b border-teal-200 bg-teal-50 px-6 py-3">
              <p className="w-full text-center text-[13px] leading-snug text-[#0B1F45]">
                ✓ This questionnaire has been submitted and is under review by DBJ. Fields are read-only.
              </p>
            </div>
          ) : null}
          <QuestionnaireStepperHeader
            fundName={data.application?.fund_name ?? 'Questionnaire'}
            completedCount={data.progress.completed_sections}
            totalSections={data.progress.total_sections}
          />
          <SectionStepper
            sections={data.sections}
            currentSectionKey={activeSection}
            onSelectSection={(k) => void goToSection(k)}
          />
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <QuestionnaireSectionPanel
            ref={panelRef}
            sectionKey={activeSection}
            canPrev={canPrev}
            canNext={canNext}
            isLastSection={idx >= 0 && idx === ORDERED_KEYS.length - 1}
            onPrev={async () => {
              if (canPrev) await goToSection(ORDERED_KEYS[idx - 1]!);
            }}
            onNext={async () => {
              if (canNext) await goToSection(ORDERED_KEYS[idx + 1]!);
            }}
          />
        </div>
      </div>
      <AIAssistant />
    </QuestionnaireProvider>
  );
}

export function QuestionnaireWorkspace({ questionnaireId }: { questionnaireId: string }) {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700">Loading…</div>
      }
    >
      <QuestionnaireWorkspaceInner questionnaireId={questionnaireId} />
    </Suspense>
  );
}
