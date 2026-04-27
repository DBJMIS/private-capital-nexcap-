'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import { SECTION_CONFIGS } from '@/lib/questionnaire/questions-config';

export type SectionNavItem = {
  section_key: DdSectionKey;
  status: string;
  section_order: number;
};

export type SectionNavProps = {
  questionnaireId: string;
  sections: SectionNavItem[];
  currentSectionKey?: DdSectionKey;
  /** When set, section changes are client-only (no route navigation). */
  onSelectSection?: (key: DdSectionKey) => void;
};

function statusIcon(status: string) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" aria-hidden />;
  }
  if (status === 'in_progress') {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" aria-hidden />;
  }
  return <Circle className="h-4 w-4 shrink-0 text-navy/25" aria-hidden />;
}

const ACTIVE_NAV =
  'border-l-2 border-navy bg-navy/[0.06] pl-[10px] font-medium text-navy shadow-none';
const INACTIVE_NAV = 'border-l-2 border-transparent pl-[10px] text-navy/80 hover:bg-navy/[0.04]';

export function SectionNav({ questionnaireId, sections, currentSectionKey, onSelectSection }: SectionNavProps) {
  const ordered = [...sections].sort((a, b) => a.section_order - b.section_order);
  const titles = new Map(SECTION_CONFIGS.map((s) => [s.key, s.title]));

  if (onSelectSection) {
    return (
      <nav className="space-y-1" aria-label="Questionnaire sections">
        {ordered.map((s) => {
          const active = currentSectionKey === s.section_key;
          return (
            <button
              key={s.section_key}
              type="button"
              onClick={() => onSelectSection(s.section_key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-none py-2 pr-3 text-left text-[13px] transition-colors',
                active ? ACTIVE_NAV : INACTIVE_NAV,
              )}
            >
              {statusIcon(s.status)}
              <span className="min-w-0 flex-1 truncate">{titles.get(s.section_key) ?? s.section_key}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="space-y-1" aria-label="Questionnaire sections">
      {ordered.map((s) => {
        const href = `/questionnaires/${questionnaireId}/sections/${s.section_key}`;
        const active = currentSectionKey === s.section_key;
        return (
          <Link
            key={s.section_key}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-none py-2 pl-[10px] pr-3 text-[13px] transition-colors',
              active ? ACTIVE_NAV : INACTIVE_NAV,
            )}
          >
            {statusIcon(s.status)}
            <span className="min-w-0 flex-1 truncate">{titles.get(s.section_key) ?? s.section_key}</span>
          </Link>
        );
      })}
    </nav>
  );
}
