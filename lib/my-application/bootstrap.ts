import type { SupabaseClient } from '@supabase/supabase-js';

import { toDraftRow } from '@/lib/onboarding/extract';
import { ensureDdSections } from '@/lib/questionnaire/ensure-questionnaire';

/**
 * Ensure a draft fund application + DD questionnaire exist for the given user (service role).
 */
export async function ensureMyApplicationDraft(
  admin: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<{ applicationId: string; questionnaireId: string } | { error: string }> {
  const { data: existing } = await admin
    .from('vc_fund_applications')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('created_by', userId)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let applicationId = existing?.id as string | undefined;

  if (!applicationId) {
    const row = toDraftRow(tenantId, userId, {}, { source: 'my_application_bootstrap' });
    const { data: ins, error: insErr } = await admin.from('vc_fund_applications').insert(row).select('id').single();
    if (insErr || !ins) return { error: insErr?.message ?? 'Failed to create application' };
    applicationId = ins.id as string;
  }

  const { data: qRow } = await admin
    .from('vc_dd_questionnaires')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId)
    .maybeSingle();

  let questionnaireId = qRow?.id as string | undefined;
  if (!questionnaireId) {
    const { data: qIns, error: qErr } = await admin
      .from('vc_dd_questionnaires')
      .insert({
        tenant_id: tenantId,
        application_id: applicationId,
        status: 'draft',
      })
      .select('id')
      .single();
    if (qErr || !qIns) return { error: qErr?.message ?? 'Failed to create questionnaire' };
    questionnaireId = qIns.id as string;
  }

  const ens = await ensureDdSections(admin, tenantId, questionnaireId);
  if (ens.error) return { error: ens.error };

  return { applicationId, questionnaireId };
}

/** Attach a questionnaire to an existing application if missing. */
export async function ensureQuestionnaireForApplication(
  admin: SupabaseClient,
  tenantId: string,
  applicationId: string,
): Promise<{ questionnaireId: string } | { error: string }> {
  const { data: qRow } = await admin
    .from('vc_dd_questionnaires')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('application_id', applicationId)
    .maybeSingle();

  if (qRow?.id) {
    return { questionnaireId: qRow.id as string };
  }

  const { data: qIns, error: qErr } = await admin
    .from('vc_dd_questionnaires')
    .insert({
      tenant_id: tenantId,
      application_id: applicationId,
      status: 'draft',
    })
    .select('id')
    .single();

  if (qErr || !qIns) return { error: qErr?.message ?? 'Failed to create questionnaire' };
  const questionnaireId = qIns.id as string;
  const ens = await ensureDdSections(admin, tenantId, questionnaireId);
  if (ens.error) return { error: ens.error };
  return { questionnaireId };
}
