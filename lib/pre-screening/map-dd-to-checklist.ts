/**
 * Auto-fill pre-screening checklist items from DD questionnaire answers.
 * File path: lib/pre-screening/map-dd-to-checklist.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { DdSectionKey } from '@/lib/questionnaire/types';
import { PRE_SCREENING_ITEM_CATALOG } from '@/lib/pre-screening/catalog';

type AnswerRow = {
  question_key: string;
  answer_text: string | null;
  answer_json: unknown;
  answer_boolean: boolean | null;
  answer_value: number | null;
  section_key: string;
};

/** Maps checklist item_key → questionnaire fields (any match → Y). */
const ITEM_SOURCES: Record<string, { section: DdSectionKey; keys: string[] }[]> = {
  management_company_name: [{ section: 'sponsor', keys: ['manager_name'] }],
  administration_company_name: [{ section: 'sponsor', keys: ['support_staff', 'outside_advisors'] }],
  responsible_persons: [
    { section: 'basic_info', keys: ['contact_persons'] },
    { section: 'governing_rules', keys: ['key_persons_obligations'] },
  ],
  legal_structure: [{ section: 'governing_rules', keys: ['shareholder_meetings_voting', 'investment_committee'] }],
  objective_sector_scope: [
    { section: 'basic_info', keys: ['geographic_area_activity'] },
    { section: 'investment_strategy', keys: ['sector_allocations', 'geographic_allocations', 'jamaica_min_allocation_pct'] },
  ],
  max_min_investment_by_sector: [
    { section: 'investment_strategy', keys: ['company_size_params', 'investment_rounds', 'sector_allocations'] },
  ],
  max_min_single_investee: [{ section: 'investment_strategy', keys: ['company_size_params'] }],
  target_investee_count: [{ section: 'deal_flow', keys: ['deal_flow_universe', 'sourcing_strategy', 'pipeline_companies'] }],
  participation_stakes: [{ section: 'investment_strategy', keys: ['stage_allocation'] }],
  investee_company_size: [{ section: 'investment_strategy', keys: ['company_size_params'] }],
  fund_duration: [{ section: 'governing_rules', keys: ['investment_period_fund_life_extensions'] }],
  investment_divestment_period: [{ section: 'governing_rules', keys: ['investment_period_fund_life_extensions'] }],
  target_fund_size_min_max: [
    { section: 'basic_info', keys: ['total_capital_commitment_usd'] },
    { section: 'investors_fundraising', keys: ['potential_investors', 'secured_investors'] },
  ],
  admin_performance_fees: [{ section: 'governing_rules', keys: ['management_fee', 'fund_expenses'] }],
  fundraising_target: [{ section: 'investors_fundraising', keys: ['potential_investors', 'secured_investors'] }],
  fundraising_stage: [{ section: 'investors_fundraising', keys: ['first_closing_date', 'subsequent_closings'] }],
  mgmt_company_capital_commitment: [
    { section: 'sponsor', keys: ['manager_will_invest'] },
    { section: 'governing_rules', keys: ['commitment_thresholds'] },
  ],
  proof_incorporation_articles: [{ section: 'legal', keys: ['legal_documents_register'] }],
  fsc_accreditation_status: [{ section: 'legal', keys: ['legal_regulations_compliance', 'legal_litigation_summary'] }],
};

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return true;
  if (typeof v === 'number') return !Number.isNaN(v);
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) {
    if (
      v.length > 0 &&
      v.every((el) => typeof el === 'object' && el !== null && ('name' in el || 'email' in el || 'phone' in el))
    ) {
      return v.some((el) => {
        const r = el as { name?: unknown; email?: unknown };
        return String(r.name ?? '').trim().length > 0 || String(r.email ?? '').trim().length > 0;
      });
    }
    return v.length > 0;
  }
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return false;
}

function answerValue(row: AnswerRow): unknown {
  if (row.answer_json != null) return row.answer_json;
  if (row.answer_boolean != null) return row.answer_boolean;
  if (row.answer_value != null) return row.answer_value;
  return row.answer_text;
}

export async function syncPreScreeningItemsFromQuestionnaire(
  supabase: SupabaseClient,
  tenantId: string,
  checklistId: string,
  questionnaireId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: sections, error: secErr } = await supabase
    .from('vc_dd_sections')
    .select('id, section_key')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);

  if (secErr || !sections?.length) {
    return { ok: false, error: secErr?.message ?? 'No questionnaire sections' };
  }

  const sectionKeyById = new Map((sections as { id: string; section_key: string }[]).map((s) => [s.id, s.section_key]));
  const sectionIds = (sections as { id: string }[]).map((s) => s.id);

  const { data: rawAnswers, error: ansErr } = await supabase
    .from('vc_dd_answers')
    .select('section_id, question_key, answer_text, answer_json, answer_boolean, answer_value')
    .eq('tenant_id', tenantId)
    .in('section_id', sectionIds);

  if (ansErr) return { ok: false, error: ansErr.message };

  const keyMap = new Map<string, unknown>();
  for (const r of rawAnswers ?? []) {
    const row = r as {
      section_id: string;
      question_key: string;
      answer_text: string | null;
      answer_json: unknown;
      answer_boolean: boolean | null;
      answer_value: number | null;
    };
    const sk = sectionKeyById.get(row.section_id);
    if (!sk) continue;
    const ar: AnswerRow = {
      section_key: sk,
      question_key: row.question_key,
      answer_text: row.answer_text,
      answer_json: row.answer_json,
      answer_boolean: row.answer_boolean,
      answer_value: row.answer_value,
    };
    keyMap.set(`${sk}:${row.question_key}`, answerValue(ar));
  }

  const [
    { count: supportStaffN },
    { count: advisorsN },
    { count: invRoundsN },
    { count: sectorAllocN },
    { count: geoAllocN },
    { count: instrumentsN },
    { count: coinvestorsN },
  ] = await Promise.all([
    supabase
      .from('vc_dd_support_staff')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('questionnaire_id', questionnaireId),
    supabase
      .from('vc_dd_advisors')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('questionnaire_id', questionnaireId),
    supabase
      .from('vc_dd_investment_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('questionnaire_id', questionnaireId),
    supabase
      .from('vc_dd_sector_allocations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('questionnaire_id', questionnaireId),
    supabase
      .from('vc_dd_geographic_allocations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('questionnaire_id', questionnaireId),
    supabase
      .from('vc_dd_investment_instruments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('questionnaire_id', questionnaireId),
    supabase
      .from('vc_dd_coinvestors')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('questionnaire_id', questionnaireId),
  ]);
  if ((supportStaffN ?? 0) > 0) keyMap.set('sponsor:support_staff', [{ _filled: true }]);
  if ((advisorsN ?? 0) > 0) keyMap.set('sponsor:outside_advisors', [{ _filled: true }]);
  if ((invRoundsN ?? 0) > 0) keyMap.set('investment_strategy:investment_rounds', [{ _filled: true }]);
  if ((sectorAllocN ?? 0) > 0) keyMap.set('investment_strategy:sector_allocations', [{ _filled: true }]);
  if ((geoAllocN ?? 0) > 0) keyMap.set('investment_strategy:geographic_allocations', [{ _filled: true }]);
  if ((instrumentsN ?? 0) > 0) keyMap.set('investment_strategy:investment_instruments', [{ _filled: true }]);
  if ((coinvestorsN ?? 0) > 0) keyMap.set('investment_strategy:coinvestors', [{ _filled: true }]);

  const { data: docs } = await supabase
    .from('vc_dd_documents')
    .select('section_id')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);

  const hasLegalDoc = (docs ?? []).some((d: { section_id: string | null }) => {
    if (!d.section_id) return false;
    return sectionKeyById.get(d.section_id) === 'legal';
  });

  for (const def of PRE_SCREENING_ITEM_CATALOG) {
    const sources = ITEM_SOURCES[def.item_key];
    let yes = false;
    if (def.item_key === 'proof_incorporation_articles') {
      const reg = keyMap.get('legal:legal_documents_register');
      yes = hasLegalDoc || isFilled(reg);
    } else if (sources) {
      yes = sources.some((src) => src.keys.some((qk) => isFilled(keyMap.get(`${src.section}:${qk}`))));
    }

    const { error: upErr } = await supabase
      .from('vc_pre_screening_items')
      .update({
        status: yes ? 'yes' : 'no',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('checklist_id', checklistId)
      .eq('item_key', def.item_key);

    if (upErr) return { ok: false, error: upErr.message };
  }

  const { data: items } = await supabase
    .from('vc_pre_screening_items')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('checklist_id', checklistId);

  const allYes = (items ?? []).every((i: { status: string }) => i.status === 'yes');

  await supabase
    .from('vc_pre_screening_checklists')
    .update({
      fund_info_complete: true,
      strategy_complete: true,
      management_complete: true,
      legal_complete: true,
      overall_pass: allYes,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', checklistId);

  return { ok: true };
}
