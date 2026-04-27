/**
 * Upsert vc_dd_answers for a section from an answer map.
 * File path: lib/questionnaire/persist-answers.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSectionConfig } from '@/lib/questionnaire/questions-config';
import type { DdSectionKey } from '@/lib/questionnaire/types';
import type { AnswerMap } from '@/lib/questionnaire/validate';
import { valueToAnswerColumns } from '@/lib/questionnaire/serialize-answers';
import type { StaffBioInput } from '@/lib/questionnaire/validate';

export async function persistSectionAnswers(
  supabase: SupabaseClient,
  tenantId: string,
  sectionId: string,
  sectionKey: DdSectionKey,
  answers: AnswerMap,
): Promise<{ error?: string }> {
  const config = getSectionConfig(sectionKey);
  if (!config) return { error: 'Unknown section' };

  for (const q of config.questions) {
    if (q.type === 'structured_list' || q.type === 'contact_persons' || q.type === 'pipeline_companies') continue;
    if (
      sectionKey === 'investment_strategy' &&
      (q.key === 'investment_rounds' ||
        q.key === 'sector_allocations' ||
        q.key === 'geographic_allocations' ||
        q.key === 'investment_instruments' ||
        q.key === 'coinvestors')
    ) {
      continue;
    }
    if (
      sectionKey === 'investors_fundraising' &&
      (q.key === 'secured_investors' || q.key === 'potential_investors')
    ) {
      continue;
    }
    if (sectionKey === 'legal' && q.key === 'legal_documents_register') {
      continue;
    }
    if (!(q.key in answers)) continue;
    const value = answers[q.key];
    const cols = valueToAnswerColumns(q, value);

    const payload = {
      tenant_id: tenantId,
      section_id: sectionId,
      question_key: q.key,
      ...cols,
    };

    const { error } = await supabase.from('vc_dd_answers').upsert(payload, {
      onConflict: 'section_id,question_key',
    });
    if (error) return { error: error.message };
  }

  return {};
}

export async function syncStaffBios(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  bios: StaffBioInput[],
): Promise<{ error?: string; bios?: { id: string }[] }> {
  const { data: existingRows } = await supabase
    .from('vc_dd_staff_bios')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);

  const keep = new Set(bios.map((b) => b.id).filter(Boolean) as string[]);
  for (const row of existingRows ?? []) {
    if (!keep.has(row.id)) {
      const { error } = await supabase.from('vc_dd_staff_bios').delete().eq('id', row.id).eq('tenant_id', tenantId);
      if (error) return { error: error.message };
    }
  }

  const out: { id: string }[] = [];

  for (const b of bios) {
    const education = Array.isArray(b.education) ? b.education : [];
    const row = {
      tenant_id: tenantId,
      questionnaire_id: questionnaireId,
      full_name: b.full_name.trim(),
      work_phone: b.work_phone ?? null,
      email: b.email ?? null,
      date_of_birth: b.date_of_birth || null,
      nationality: b.nationality ?? null,
      education,
      work_experience: b.work_experience ?? null,
      fund_responsibilities: b.fund_responsibilities ?? null,
    };

    if (b.id) {
      const { data, error } = await supabase
        .from('vc_dd_staff_bios')
        .update(row)
        .eq('id', b.id)
        .eq('tenant_id', tenantId)
        .select('id')
        .single();
      if (error) return { error: error.message };
      if (data) out.push(data);
    } else {
      const { data, error } = await supabase.from('vc_dd_staff_bios').insert(row).select('id').single();
      if (error) return { error: error.message };
      if (data) out.push(data);
    }
  }

  return { bios: out };
}

/**
 * Insert/update staff bios without deleting rows missing from the payload.
 * Used by sponsor section when editing bios from the personnel modal.
 */
export async function upsertStaffBiosPartial(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
  bios: StaffBioInput[],
): Promise<{ error?: string; ids?: string[] }> {
  const ids: string[] = [];
  for (const b of bios) {
    const education = Array.isArray(b.education) ? b.education : [];
    const row = {
      tenant_id: tenantId,
      questionnaire_id: questionnaireId,
      full_name: (b.full_name ?? '').trim() || '—',
      work_phone: b.work_phone ?? null,
      email: b.email ?? null,
      date_of_birth: b.date_of_birth || null,
      nationality: b.nationality ?? null,
      education,
      work_experience: b.work_experience ?? null,
      fund_responsibilities: b.fund_responsibilities ?? null,
    };

    if (b.id) {
      const { error } = await supabase
        .from('vc_dd_staff_bios')
        .update(row)
        .eq('id', b.id)
        .eq('tenant_id', tenantId)
        .eq('questionnaire_id', questionnaireId);
      if (error) return { error: error.message };
      ids.push(b.id);
    } else {
      const { data, error } = await supabase.from('vc_dd_staff_bios').insert(row).select('id').single();
      if (error) return { error: error.message };
      if (data?.id) ids.push(data.id as string);
    }
  }
  return { ids };
}
