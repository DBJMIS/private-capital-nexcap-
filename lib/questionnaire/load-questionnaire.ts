/**
 * Load questionnaire + ownership check (tenant).
 * File path: lib/questionnaire/load-questionnaire.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadQuestionnaireForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  questionnaireId: string,
) {
  const { data: q, error } = await supabase
    .from('vc_dd_questionnaires')
    .select('*')
    .eq('id', questionnaireId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) return { error: error.message, questionnaire: null, application: null };
  if (!q) return { error: 'Not found', questionnaire: null, application: null };

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, status, manager_name')
    .eq('id', q.application_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return { error: null, questionnaire: q, application: app };
}
