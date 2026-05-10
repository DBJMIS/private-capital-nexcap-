import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Profile } from '@/types/auth';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export type QuestionnaireAccessRow = {
  questionnaire: { id: string; application_id: string; status: string; tenant_id: string };
  application: {
    id: string;
    created_by: string;
    fund_name: string;
    status: string;
    fund_manager_id: string | null;
  };
};

/**
 * Ensures the questionnaire exists in the tenant and the caller may access it.
 * Fund managers: Path A — application.created_by === userId; Path B — portal contact
 * (fund_manager_contacts.portal_user_id) whose fund_manager_id matches the application's fund_manager_id.
 * Staff roles: unchanged (tenant-scoped load only; route handlers enforce staff rules).
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
    .select('id, created_by, fund_name, status, fund_manager_id')
    .eq('id', q.application_id)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (aErr || !app) {
    return { error: 'Application not found', status: 404 };
  }

  const application: QuestionnaireAccessRow['application'] = {
    id: app.id,
    created_by: app.created_by,
    fund_name: app.fund_name,
    status: app.status,
    fund_manager_id: typeof app.fund_manager_id === 'string' ? app.fund_manager_id : null,
  };

  if (profile.role === 'fund_manager') {
    if (application.created_by === userId) {
      return { questionnaire: q, application };
    }

    const adminClient = createServiceRoleClient();
    const { data: contact, error: contactErr } = await adminClient
      .from('fund_manager_contacts')
      .select('fund_manager_id')
      .eq('portal_user_id', userId)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle();

    if (contactErr) {
      console.error('[assertQuestionnaireAccess] fund_manager_contacts lookup', contactErr.message);
      return { error: 'Could not verify portal access', status: 500 };
    }

    const contactFm =
      contact && typeof contact.fund_manager_id === 'string' ? contact.fund_manager_id.trim() : null;
    const appFm = application.fund_manager_id?.trim() ?? null;

    if (contactFm != null && appFm != null && contactFm === appFm) {
      return { questionnaire: q, application };
    }

    return { error: 'Forbidden', status: 403 };
  }

  return { questionnaire: q, application };
}
