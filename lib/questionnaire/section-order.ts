import type { DdSectionKey } from '@/lib/questionnaire/types';

/** Nine DBJ DD sections (Roman I–IX). */
export const DD_SECTION_SEQUENCE: { key: DdSectionKey; order: number }[] = [
  { key: 'basic_info', order: 1 },
  { key: 'sponsor', order: 2 },
  { key: 'deal_flow', order: 3 },
  { key: 'portfolio_monitoring', order: 4 },
  { key: 'investment_strategy', order: 5 },
  { key: 'governing_rules', order: 6 },
  { key: 'investors_fundraising', order: 7 },
  { key: 'legal', order: 8 },
  { key: 'additional', order: 9 },
];

export function sectionOrderOf(key: DdSectionKey): number {
  return DD_SECTION_SEQUENCE.find((s) => s.key === key)?.order ?? 99;
}
