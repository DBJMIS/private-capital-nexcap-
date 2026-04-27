/**
 * Ensure vc_dd_sections rows exist for the nine DBJ sections.
 * File path: lib/questionnaire/ensure-questionnaire.ts
 *
 * Reconciles legacy rows: unique (questionnaire_id, section_order) can block inserts
 * when a row already exists at that order under an old section_key not in the current sequence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DD_SECTION_SEQUENCE } from '@/lib/questionnaire/section-order';

type SectionRow = { id: string; section_key: string; section_order: number };

export async function ensureDdSections(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
): Promise<{ error?: string }> {
  const { data: existing, error: selErr } = await supabase
    .from('vc_dd_sections')
    .select('id, section_key, section_order')
    .eq('tenant_id', tenantId)
    .eq('questionnaire_id', questionnaireId);

  if (selErr) return { error: selErr.message };

  const rows = (existing ?? []) as SectionRow[];
  const byKey = new Map(rows.map((r) => [r.section_key, r]));
  const byOrder = new Map<number, SectionRow>();
  for (const r of rows) {
    byOrder.set(r.section_order, r);
  }

  for (const s of DD_SECTION_SEQUENCE) {
    if (byKey.has(s.key)) continue;

    const atOrder = byOrder.get(s.order);
    if (atOrder && atOrder.section_key !== s.key) {
      const { error: upErr } = await supabase
        .from('vc_dd_sections')
        .update({ section_key: s.key })
        .eq('tenant_id', tenantId)
        .eq('questionnaire_id', questionnaireId)
        .eq('id', atOrder.id);

      if (upErr) return { error: upErr.message };

      byKey.delete(atOrder.section_key);
      byKey.set(s.key, { ...atOrder, section_key: s.key });
      byOrder.set(s.order, { ...atOrder, section_key: s.key });
    }
  }

  const haveKey = new Set(byKey.keys());
  const toInsert = DD_SECTION_SEQUENCE.filter((s) => !haveKey.has(s.key)).map((s) => ({
    tenant_id: tenantId,
    questionnaire_id: questionnaireId,
    section_key: s.key,
    section_order: s.order,
    status: 'not_started' as const,
  }));

  if (toInsert.length === 0) return {};

  const { error: insErr } = await supabase.from('vc_dd_sections').insert(toInsert);
  if (insErr) return { error: insErr.message };
  return {};
}
