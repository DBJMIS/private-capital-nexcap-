/**
 * Load a compact summary of all DD answers + staff bios for AI "summarize" mode.
 * File path: lib/questionnaire/load-questionnaire-answers-summary.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { loadAllSponsorStructuredLists, loadStructuredListRows } from '@/lib/questionnaire/structured-list-db';
import { STRUCTURED_LIST_REGISTRY, type StructuredListKind } from '@/lib/questionnaire/structured-list-registry';

export type QuestionnaireAnswersSummary = {
  by_section: Record<
    string,
    Array<{
      question_key: string;
      answer_text: string | null;
      answer_value: number | null;
      answer_boolean: boolean | null;
      answer_json: unknown;
    }>
  >;
  staff_bios: Array<{
    full_name: string;
    email: string | null;
    work_experience: string | null;
    fund_responsibilities: string | null;
  }>;
};

export async function loadQuestionnaireAnswersSummary(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<QuestionnaireAnswersSummary> {
  const { data: sections } = await supabase
    .from('vc_dd_sections')
    .select('id, section_key')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);

  const by_section: QuestionnaireAnswersSummary['by_section'] = {};
  const sectionIdToKey = new Map<string, string>();
  for (const s of sections ?? []) {
    sectionIdToKey.set(s.id, s.section_key);
    by_section[s.section_key] = [];
  }

  const sectionIds = [...sectionIdToKey.keys()];
  if (sectionIds.length) {
    const { data: answers } = await supabase
      .from('vc_dd_answers')
      .select('section_id, question_key, answer_text, answer_value, answer_boolean, answer_json')
      .eq('tenant_id', tenantId)
      .in('section_id', sectionIds);

    for (const row of answers ?? []) {
      const key = sectionIdToKey.get(row.section_id);
      if (!key) continue;
      by_section[key] ??= [];
      by_section[key].push({
        question_key: row.question_key,
        answer_text: row.answer_text,
        answer_value: row.answer_value,
        answer_boolean: row.answer_boolean,
        answer_json: row.answer_json,
      });
    }
  }

  if (by_section.sponsor) {
    try {
      const lists = await loadAllSponsorStructuredLists(supabase, tenantId, questionnaireId);
      for (const [qk, arr] of Object.entries(lists)) {
        by_section.sponsor.push({
          question_key: qk,
          answer_text: null,
          answer_value: null,
          answer_boolean: null,
          answer_json: arr,
        });
      }
    } catch {
      /* ignore summary enrichment failures */
    }
  }

  if (by_section.basic_info) {
    try {
      const cp = await loadStructuredListRows(supabase, tenantId, questionnaireId, 'contact_persons');
      if (cp.length) {
        by_section.basic_info.push({
          question_key: 'contact_persons',
          answer_text: null,
          answer_value: null,
          answer_boolean: null,
          answer_json: cp,
        });
      }
    } catch {
      /* ignore */
    }
  }

  const investmentStrategyKinds: StructuredListKind[] = [
    'investment_rounds',
    'sector_allocations',
    'geographic_allocations',
    'investment_instruments',
    'coinvestors',
  ];
  if (by_section.investment_strategy) {
    try {
      for (const kind of investmentStrategyKinds) {
        const rows = await loadStructuredListRows(supabase, tenantId, questionnaireId, kind);
        if (rows.length > 0) {
          by_section.investment_strategy.push({
            question_key: STRUCTURED_LIST_REGISTRY[kind].questionKey,
            answer_text: null,
            answer_value: null,
            answer_boolean: null,
            answer_json: rows,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const { data: bios } = await supabase
    .from('vc_dd_staff_bios')
    .select('full_name, email, work_experience, fund_responsibilities')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);

  return {
    by_section,
    staff_bios: (bios ?? []).map((b) => ({
      full_name: b.full_name,
      email: b.email,
      work_experience: b.work_experience,
      fund_responsibilities: b.fund_responsibilities,
    })),
  };
}
