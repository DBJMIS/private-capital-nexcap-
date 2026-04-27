/**
 * Ensure vc_pre_screening_checklists + catalog rows exist for an application.
 * File path: lib/pre-screening/ensure-checklist.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { PRE_SCREENING_ITEM_CATALOG } from '@/lib/pre-screening/catalog';

export type PreScreeningChecklistRow = {
  id: string;
  tenant_id: string;
  application_id: string;
  fund_info_complete: boolean;
  strategy_complete: boolean;
  management_complete: boolean;
  legal_complete: boolean;
  overall_pass: boolean;
  flagged_for_review: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
};

export type PreScreeningItemRowDb = {
  id: string;
  checklist_id: string;
  category: string;
  item_key: string;
  label: string;
  status: 'yes' | 'no' | 'pending';
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
};

export async function ensurePreScreeningChecklist(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
): Promise<{ checklist: PreScreeningChecklistRow; items: PreScreeningItemRowDb[] } | { error: string }> {
  const { data: existing, error: selErr } = await supabase
    .from('vc_pre_screening_checklists')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (selErr) {
    return { error: selErr.message };
  }

  let checklist = existing as PreScreeningChecklistRow | null;

  if (!checklist) {
    const { data: inserted, error: insErr } = await supabase
      .from('vc_pre_screening_checklists')
      .insert({
        tenant_id: tenantId,
        application_id: applicationId,
      })
      .select('*')
      .single();

    if (insErr || !inserted) {
      return { error: insErr?.message ?? 'Failed to create checklist' };
    }
    checklist = inserted as PreScreeningChecklistRow;
  }

  const { data: existingItems, error: itemsErr } = await supabase
    .from('vc_pre_screening_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('checklist_id', checklist.id);

  if (itemsErr) {
    return { error: itemsErr.message };
  }

  const have = new Set((existingItems ?? []).map((r: { item_key: string }) => r.item_key));
  const missing = PRE_SCREENING_ITEM_CATALOG.filter((d) => !have.has(d.item_key));

  if (missing.length > 0) {
    const rows = missing.map((d) => ({
      tenant_id: tenantId,
      checklist_id: checklist!.id,
      category: d.category,
      item_key: d.item_key,
      label: d.label,
      status: 'pending' as const,
    }));

    const { error: seedErr } = await supabase.from('vc_pre_screening_items').insert(rows);
    if (seedErr) {
      return { error: seedErr.message };
    }
  }

  const { data: allItems, error: allErr } = await supabase
    .from('vc_pre_screening_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('checklist_id', checklist.id)
    .order('category', { ascending: true })
    .order('item_key', { ascending: true });

  if (allErr || !allItems) {
    return { error: allErr?.message ?? 'Failed to load items' };
  }

  return { checklist, items: allItems as PreScreeningItemRowDb[] };
}
