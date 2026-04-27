/**
 * Split flat answers vs structured list payloads for section PUT.
 * File path: lib/questionnaire/section-persist-split.ts
 */

import type { DdSectionKey } from '@/lib/questionnaire/types';
import type { AnswerMap } from '@/lib/questionnaire/validate';
import { normalizeContactPersonsValue } from '@/lib/questionnaire/contact-persons';

const SPONSOR_LIST_KEYS = [
  'shareholders',
  'investment_professionals',
  'support_staff',
  'outside_advisors',
  'office_locations',
  'outsourced_services',
] as const;

const INVESTORS_FUNDRAISING_LIST_KEYS = ['secured_investors', 'potential_investors'] as const;

const DEAL_FLOW_LIST_KEYS = ['pipeline_companies'] as const;

const INVESTMENT_STRATEGY_LIST_KEYS = [
  'investment_rounds',
  'sector_allocations',
  'geographic_allocations',
  'investment_instruments',
  'coinvestors',
] as const;

const LEGAL_LIST_KEYS = ['legal_documents_register'] as const;

export function filterPersistableAnswers(sectionKey: DdSectionKey, answers: AnswerMap): AnswerMap {
  const out: AnswerMap = { ...answers };
  if (sectionKey === 'sponsor') {
    for (const k of SPONSOR_LIST_KEYS) {
      delete out[k];
    }
  }
  if (sectionKey === 'basic_info') {
    delete out.contact_persons;
  }
  if (sectionKey === 'investors_fundraising') {
    for (const k of INVESTORS_FUNDRAISING_LIST_KEYS) {
      delete out[k];
    }
  }
  if (sectionKey === 'deal_flow') {
    for (const k of DEAL_FLOW_LIST_KEYS) {
      delete out[k];
    }
  }
  if (sectionKey === 'investment_strategy') {
    for (const k of INVESTMENT_STRATEGY_LIST_KEYS) {
      delete out[k];
    }
  }
  if (sectionKey === 'legal') {
    for (const k of LEGAL_LIST_KEYS) {
      delete out[k];
    }
  }
  return out;
}

export function extractStructuredListsPayload(
  sectionKey: DdSectionKey,
  answers: AnswerMap,
): Record<string, unknown> | undefined {
  if (sectionKey === 'sponsor') {
    const payload: Record<string, unknown> = {};
    for (const k of SPONSOR_LIST_KEYS) {
      payload[k] = answers[k];
    }
    return payload;
  }
  if (sectionKey === 'basic_info') {
    return { contact_persons: normalizeContactPersonsValue(answers.contact_persons) };
  }
  if (sectionKey === 'investors_fundraising') {
    const payload: Record<string, unknown> = {};
    for (const k of INVESTORS_FUNDRAISING_LIST_KEYS) {
      payload[k] = answers[k];
    }
    return payload;
  }
  if (sectionKey === 'deal_flow') {
    const payload: Record<string, unknown> = {};
    for (const k of DEAL_FLOW_LIST_KEYS) {
      payload[k] = answers[k];
    }
    return payload;
  }
  if (sectionKey === 'investment_strategy') {
    const payload: Record<string, unknown> = {};
    for (const k of INVESTMENT_STRATEGY_LIST_KEYS) {
      payload[k] = answers[k];
    }
    return payload;
  }
  if (sectionKey === 'legal') {
    const payload: Record<string, unknown> = {};
    for (const k of LEGAL_LIST_KEYS) {
      payload[k] = answers[k];
    }
    return payload;
  }
  return undefined;
}
