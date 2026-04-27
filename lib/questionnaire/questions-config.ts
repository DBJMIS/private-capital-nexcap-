/**
 * DBJ Fund Manager Due Diligence Questionnaire — merged section config.
 * UI and validation consume this module (not hardcoded field lists in components).
 *
 * File path: lib/questionnaire/questions-config.ts
 */

import type { DdSectionKey, QuestionDef, SectionMeta } from '@/lib/questionnaire/types';
import { basicInfoSection } from '@/lib/questionnaire/sections/basic-info';
import { sponsorSection } from '@/lib/questionnaire/sections/sponsor';
import { dealFlowSection } from '@/lib/questionnaire/sections/deal-flow';
import { portfolioMonitoringSection } from '@/lib/questionnaire/sections/portfolio-monitoring';
import { investmentStrategySection } from '@/lib/questionnaire/sections/investment-strategy';
import { governingRulesSection } from '@/lib/questionnaire/sections/governing-rules';
import { investorsFundraisingSection } from '@/lib/questionnaire/sections/investors-fundraising';
import { legalSection } from '@/lib/questionnaire/sections/legal';
import { additionalInformationSection } from '@/lib/questionnaire/sections/additional';

export const SECTION_CONFIGS: SectionMeta[] = [
  basicInfoSection,
  sponsorSection,
  dealFlowSection,
  portfolioMonitoringSection,
  investmentStrategySection,
  governingRulesSection,
  investorsFundraisingSection,
  legalSection,
  additionalInformationSection,
];

const byKey = new Map<DdSectionKey, SectionMeta>(SECTION_CONFIGS.map((s) => [s.key, s]));

export function getSectionConfig(key: DdSectionKey): SectionMeta | undefined {
  return byKey.get(key);
}

export function getQuestionByKey(sectionKey: DdSectionKey, questionKey: string): QuestionDef | undefined {
  const sec = byKey.get(sectionKey);
  return sec?.questions.find((q) => q.key === questionKey);
}

export function allSectionKeys(): DdSectionKey[] {
  return SECTION_CONFIGS.map((s) => s.key);
}
