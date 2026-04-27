'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import type { SectionNavItem } from '@/components/questionnaire/SectionNav';

/** Abbreviated labels (max width / short names per spec). */
const STEP_LABEL: Record<DdSectionKey, string> = {
  basic_info: 'Basic Info',
  sponsor: 'Sponsor',
  deal_flow: 'Deal Flow',
  portfolio_monitoring: 'Monitoring',
  investment_strategy: 'Strategy',
  governing_rules: 'Gov. Rules',
  investors_fundraising: 'Investors',
  legal: 'Legal',
  additional: 'Additional',
};

export type SectionStepperProps = {
  sections: SectionNavItem[];
  currentSectionKey: DdSectionKey;
  onSelectSection: (key: DdSectionKey) => void;
};

function normStatus(status: string | undefined) {
  return String(status ?? '').toLowerCase();
}

export function SectionStepper({ sections, currentSectionKey, onSelectSection }: SectionStepperProps) {
  const ordered = [...sections].sort((a, b) => a.section_order - b.section_order);
  const n = ordered.length;

  return (
    <div className="w-full border-b border-[#E5E7EB] bg-white px-8 py-4">
      <div className="flex w-full min-w-0 items-start justify-between">
        {ordered.map((s, i) => {
          const st = normStatus(s.status);
          const active = s.section_key === currentSectionKey;
          const completed = st === 'completed';
          const inProgress = st === 'in_progress' && !active;
          const stepNum = i + 1;
          const label = STEP_LABEL[s.section_key as DdSectionKey] ?? s.section_key;
          const prevCompleted = i > 0 && normStatus(ordered[i - 1]!.status) === 'completed';
          const thisCompleted = st === 'completed';

          return (
            <div key={s.section_key} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="relative flex h-7 w-full items-center justify-center">
                {i > 0 ? (
                  <div
                    className={cn(
                      'absolute right-1/2 top-[13px] z-0 h-0.5 w-1/2',
                      prevCompleted ? 'bg-[#0F8A6E]' : 'bg-gray-200',
                    )}
                    aria-hidden
                  />
                ) : null}
                {i < n - 1 ? (
                  <div
                    className={cn(
                      'absolute left-1/2 top-[13px] z-0 h-0.5 w-1/2',
                      thisCompleted ? 'bg-[#0F8A6E]' : 'bg-gray-200',
                    )}
                    aria-hidden
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => onSelectSection(s.section_key as DdSectionKey)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F45] focus-visible:ring-offset-2',
                    active && 'bg-[#0B1F45] text-white',
                    completed && !active && 'bg-[#0F8A6E] text-white',
                    inProgress && 'border-2 border-[#C8973A] bg-white text-[#C8973A]',
                    !active && !completed && !inProgress && 'border-2 border-gray-300 bg-white text-gray-400',
                  )}
                >
                  {completed && !active ? (
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  ) : (
                    <span className="text-[12px]">{stepNum}</span>
                  )}
                </button>
              </div>
              <span
                className={cn(
                  'mt-1 max-w-full truncate px-0.5 text-center text-xs leading-tight',
                  active ? 'font-semibold text-[#0B1F45]' : 'text-gray-400',
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
