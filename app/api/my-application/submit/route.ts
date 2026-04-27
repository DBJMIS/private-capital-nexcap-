import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/auth/session';
import { ensurePreScreeningChecklist } from '@/lib/pre-screening/ensure-checklist';
import { syncPreScreeningItemsFromQuestionnaire } from '@/lib/pre-screening/map-dd-to-checklist';
import { runAiScoringForApplication } from '@/lib/evaluation/run-ai-scoring';
import { scheduleAuditLog } from '@/lib/audit/log';
import { notifyFundManagerEvaluation } from '@/lib/workflow/notify-stub';

export const dynamic = 'force-dynamic';

export async function POST() {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (profile.role !== 'fund_manager') {
    return NextResponse.json({ error: 'Fund managers only' }, { status: 403 });
  }

  const admin = createServiceRoleClient();

  const { data: app } = await admin
    .from('vc_fund_applications')
    .select('id, status, fund_name, cfp_id')
    .eq('tenant_id', profile.tenant_id)
    .eq('created_by', user.id)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!app) {
    return NextResponse.json({ error: 'No draft application to submit' }, { status: 400 });
  }

  const appRow = app as { cfp_id: string | null };
  if (!appRow.cfp_id) {
    return NextResponse.json(
      { error: 'Select an active Call for Proposals before submitting your application.' },
      { status: 400 },
    );
  }

  const { data: cfpActive } = await admin
    .from('vc_cfps')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', appRow.cfp_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!cfpActive) {
    return NextResponse.json(
      { error: 'Linked CFP is no longer active. Return to onboarding and choose an active call.' },
      { status: 400 },
    );
  }

  const { data: qn } = await admin
    .from('vc_dd_questionnaires')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', app.id)
    .maybeSingle();

  if (!qn?.id) {
    return NextResponse.json({ error: 'Questionnaire not found' }, { status: 400 });
  }

  const { data: sections } = await admin
    .from('vc_dd_sections')
    .select('status')
    .eq('tenant_id', profile.tenant_id)
    .eq('questionnaire_id', qn.id);

  const allComplete = (sections ?? []).length > 0 && (sections ?? []).every((s: { status: string }) => s.status === 'completed');
  if (!allComplete) {
    return NextResponse.json({ error: 'All questionnaire sections must be completed before submit' }, { status: 400 });
  }

  const now = new Date().toISOString();

  await admin
    .from('vc_dd_questionnaires')
    .update({ status: 'completed', completed_at: now })
    .eq('id', qn.id)
    .eq('tenant_id', profile.tenant_id);

  const { error: appErr } = await admin
    .from('vc_fund_applications')
    .update({ status: 'submitted', submitted_at: now })
    .eq('id', app.id)
    .eq('tenant_id', profile.tenant_id);

  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: app.id,
    action: 'submitted',
    beforeState: { status: 'draft' },
    afterState: { status: 'submitted' },
    metadata: { source: 'my_application_submit' },
  });

  const ensured = await ensurePreScreeningChecklist(admin, profile.tenant_id, app.id);
  if ('error' in ensured) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  const sync = await syncPreScreeningItemsFromQuestionnaire(
    admin,
    profile.tenant_id,
    ensured.checklist.id,
    qn.id,
  );
  if (!sync.ok) {
    return NextResponse.json({ error: sync.error }, { status: 500 });
  }

  const { data: chk } = await admin
    .from('vc_pre_screening_checklists')
    .select('overall_pass')
    .eq('id', ensured.checklist.id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!chk?.overall_pass) {
    await admin
      .from('vc_fund_applications')
      .update({
        status: 'rejected',
        rejection_reason:
          'Automatic pre-screening: one or more checklist items were not satisfied from the submitted questionnaire.',
      })
      .eq('id', app.id)
      .eq('tenant_id', profile.tenant_id);

    await notifyFundManagerEvaluation({
      tenantId: profile.tenant_id,
      applicationId: app.id,
      kind: 'rejected',
      message: 'Your application did not pass automatic pre-screening.',
    });

    return NextResponse.json({ ok: true, outcome: 'rejected_pre_screen' });
  }

  const ai = await runAiScoringForApplication({
    supabase: admin,
    tenantId: profile.tenant_id,
    applicationId: app.id,
    questionnaireId: qn.id,
    evaluatorUserId: user.id,
    actorIdForAudit: user.id,
  });

  if (!ai.ok) {
    return NextResponse.json({ error: ai.error }, { status: 500 });
  }

  await notifyFundManagerEvaluation({
    tenantId: profile.tenant_id,
    applicationId: app.id,
    kind: 'under_review',
    message: 'Your application is under DBJ review.',
  });

  return NextResponse.json({ ok: true, outcome: 'under_review', assessment_id: ai.assessmentId, score: ai.overall });
}
