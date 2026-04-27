/**
 * Persist derived category flags on vc_pre_screening_checklists from item rows.
 * File path: lib/pre-screening/sync-checklist.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { checklistBooleanColumns, type PreScreeningItemRow } from '@/lib/pre-screening/evaluate';

export async function syncChecklistCategoryFlags(
  supabase: SupabaseClient,
  tenantId: string,
  checklistId: string,
  items: PreScreeningItemRow[],
): Promise<{ error?: string }> {
  const flags = checklistBooleanColumns(items);
  const { error } = await supabase
    .from('vc_pre_screening_checklists')
    .update({
      fund_info_complete: flags.fund_info_complete,
      strategy_complete: flags.strategy_complete,
      management_complete: flags.management_complete,
      legal_complete: flags.legal_complete,
    })
    .eq('tenant_id', tenantId)
    .eq('id', checklistId);

  return error ? { error: error.message } : {};
}
