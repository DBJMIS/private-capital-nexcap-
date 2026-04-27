import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Flatten questionnaire answers into a single text block for AI scoring.
 */
export async function loadQuestionnairePlaintext(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<string> {
  const { data: sections } = await supabase
    .from('vc_dd_sections')
    .select('id, section_key')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);

  const ids = (sections ?? []).map((s: { id: string }) => s.id);
  if (!ids.length) return '';

  const { data: answers } = await supabase
    .from('vc_dd_answers')
    .select('section_id, question_key, answer_text, answer_json, answer_boolean, answer_value')
    .eq('tenant_id', tenantId)
    .in('section_id', ids);

  const sk = new Map((sections ?? []).map((s: { id: string; section_key: string }) => [s.id, s.section_key]));

  const lines: string[] = [];
  for (const r of answers ?? []) {
    const row = r as {
      section_id: string;
      question_key: string;
      answer_text: string | null;
      answer_json: unknown;
      answer_boolean: boolean | null;
      answer_value: number | null;
    };
    const sectionKey = sk.get(row.section_id) ?? '?';
    let val: string;
    if (row.answer_json != null) val = JSON.stringify(row.answer_json).slice(0, 8000);
    else if (row.answer_boolean != null) val = String(row.answer_boolean);
    else if (row.answer_value != null) val = String(row.answer_value);
    else val = (row.answer_text ?? '').slice(0, 8000);
    if (!val.trim()) continue;
    lines.push(`[${sectionKey} / ${row.question_key}]\n${val}`);
  }

  const { data: bios } = await supabase
    .from('vc_dd_staff_bios')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);

  for (const b of bios ?? []) {
    lines.push(`[staff_bios / ${b.full_name}]\n${JSON.stringify(b).slice(0, 6000)}`);
  }

  return lines.join('\n\n').slice(0, 100_000);
}
