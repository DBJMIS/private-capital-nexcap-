import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Profile } from '@/types/auth';

export type QuestionnaireAccessRow = {
  questionnaire: { id: string; application_id: string; status: string; tenant_id: string };
  application: { id: string; created_by: string; fund_name: string; status: string };
};

/**
 * Ensures the questionnaire exists in the tenant and the caller may access it.
 * Fund managers may only access questionnaires for applications they created.
 */
export async function assertQuestionnaireAccess(
  supabase: SupabaseClient,
  profile: Profile,
  userId: string,
  questionnaireId: string,
): Promise<QuestionnaireAccessRow | { error: string; status: number }> {
  const { data: q, error: qErr } = await supabase
    .from('vc_dd_questionnaires')
    .select('id, application_id, status, tenant_id')
    .eq('id', questionnaireId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (qErr || !q) {
    return { error: 'Questionnaire not found', status: 404 };
  }

  const { data: app, error: aErr } = await supabase
    .from('vc_fund_applications')
    .select('id, created_by, fund_name, status')
    .eq('id', q.application_id)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (aErr || !app) {
    return { error: 'Application not found', status: 404 };
  }

  if (profile.role === 'fund_manager' && app.created_by !== userId) {
    return { error: 'Forbidden', status: 403 };
  }

  return { questionnaire: q, application: app };
}
