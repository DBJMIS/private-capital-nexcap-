/**
 * Merge normalized structured-list tables into flat section answers for GET.
 * File path: lib/questionnaire/merge-section-structured-load.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { DdSectionKey } from '@/lib/questionnaire/types';
import { STRUCTURED_LIST_REGISTRY, type StructuredListKind } from '@/lib/questionnaire/structured-list-registry';
import { loadStructuredListRows } from '@/lib/questionnaire/structured-list-db';
import { ensureMinStructuredRows } from '@/lib/questionnaire/structured-list-defaults';
import { normalizeContactPersonsValue } from '@/lib/questionnaire/contact-persons';
import { loadPipelineCompanies } from '@/lib/questionnaire/pipeline-companies-db';
import {
  loadLegalDocumentsRegisterForQuestionnaire,
  loadPotentialInvestorsForQuestionnaire,
  loadSecuredInvestorsForQuestionnaire,
} from '@/lib/questionnaire/persist-investors-legal';

const INVESTMENT_STRATEGY_LIST_KINDS: StructuredListKind[] = [
  'investment_rounds',
  'sector_allocations',
  'geographic_allocations',
  'investment_instruments',
  'coinvestors',
];

const SPONSOR_LIST_KINDS: StructuredListKind[] = [
  'shareholders',
  'investment_professionals',
  'support_staff',
  'outside_advisors',
  'office_locations',
  'outsourced_services',
];

export async function mergeStructuredListsIntoSectionAnswers(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  sectionKey: DdSectionKey,
  answers: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const merged = { ...answers };

  if (sectionKey === 'sponsor') {
    for (const kind of SPONSOR_LIST_KINDS) {
      const qk = STRUCTURED_LIST_REGISTRY[kind].questionKey;
      const rows = await loadStructuredListRows(supabase, tenantId, questionnaireId, kind);
      merged[qk] = ensureMinStructuredRows(kind, rows);
    }
    return merged;
  }

  if (sectionKey === 'basic_info') {
    const rows = await loadStructuredListRows(supabase, tenantId, questionnaireId, 'contact_persons');
    if (rows.length > 0) {
      merged.contact_persons = ensureMinStructuredRows('contact_persons', rows);
    } else {
      merged.contact_persons = normalizeContactPersonsValue(merged.contact_persons);
    }
    return merged;
  }

  return merged;
}

/** Merge `vc_dd_pipeline_companies` into flat answers for Section III GET / complete validation. */
export async function mergeDealFlowPipelineIntoSectionAnswers(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  answers: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { rows, error } = await loadPipelineCompanies(supabase, tenantId, questionnaireId);
  if (!error && rows.length > 0) {
    return { ...answers, pipeline_companies: rows };
  }
  const legacy = answers.pipeline_companies;
  if (Array.isArray(legacy) && legacy.length > 0) {
    return { ...answers, pipeline_companies: legacy };
  }
  return { ...answers, pipeline_companies: [] };
}

/** Merge Section V normalized tables into flat answers for GET / complete validation. */
export async function mergeInvestmentStrategyStructuredIntoSectionAnswers(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  answers: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const merged = { ...answers };
  for (const kind of INVESTMENT_STRATEGY_LIST_KINDS) {
    const qk = STRUCTURED_LIST_REGISTRY[kind].questionKey;
    const rows = await loadStructuredListRows(supabase, tenantId, questionnaireId, kind);
    merged[qk] = ensureMinStructuredRows(kind, rows);
  }
  return merged;
}

/** Merge Section VII normalized investor tables into flat answers. */
export async function mergeInvestorsFundraisingStructuredIntoSectionAnswers(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  answers: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const secured = await loadSecuredInvestorsForQuestionnaire(supabase, tenantId, questionnaireId);
  const potential = await loadPotentialInvestorsForQuestionnaire(supabase, tenantId, questionnaireId);
  return {
    ...answers,
    secured_investors: ensureMinStructuredRows('secured_investors', secured),
    potential_investors: ensureMinStructuredRows('potential_investors', potential),
  };
}

/** Merge Section VIII legal document register from `vc_dd_legal_documents` (source of truth for GET / complete). */
export async function mergeLegalDocumentsRegisterIntoSectionAnswers(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  answers: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let rows: Record<string, unknown>[] = [];
  try {
    rows = await loadLegalDocumentsRegisterForQuestionnaire(supabase, tenantId, questionnaireId);
  } catch (e) {
    console.error('[mergeLegalDocumentsRegisterIntoSectionAnswers] load failed', e);
  }
  return { ...answers, legal_documents_register: rows };
}
