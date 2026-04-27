'use client';

import { createContext, useContext } from 'react';

import type { SectionNavItem } from '@/components/questionnaire/SectionNav';
import type { DdSectionKey } from '@/lib/questionnaire/types';

/** Live form state surfaced to the AI co-pilot (section editor updates this). */
export type QuestionnaireAiSurface = {
  sectionKey: string | null;
  sectionTitle: string | null;
  questionKey: string | null;
  currentAnswers: Record<string, unknown>;
};

/** Snapshot returned after refetching workspace data (e.g. after section save / complete). */
export type QuestionnaireRefreshSnapshot = {
  questionnaire?: { status?: string; completed_at?: string | null };
  all_sections_complete?: boolean;
};

export type QuestionnaireShellState = {
  questionnaireId: string;
  fundName: string | null;
  /** `vc_dd_questionnaires.status` (e.g. completed → read-only workspace). */
  questionnaireStatus: string | null;
  sections: SectionNavItem[];
  completedCount: number;
  totalSections: number;
  actorRole: string;
  refresh: () => Promise<QuestionnaireRefreshSnapshot | null>;
  updateSectionStatus: (sectionKey: DdSectionKey, status: string) => void;
  aiSurface: QuestionnaireAiSurface;
  setAiSurface: (patch: Partial<QuestionnaireAiSurface>) => void;
};

const Ctx = createContext<QuestionnaireShellState | null>(null);

export function QuestionnaireProvider({
  value,
  children,
}: {
  value: QuestionnaireShellState;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQuestionnaireShell() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useQuestionnaireShell must be used within QuestionnaireProvider');
  return v;
}
