import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/auth/session';
import { ensureMyApplicationDraft, ensureQuestionnaireForApplication } from '@/lib/my-application/bootstrap';

export const dynamic = 'force-dynamic';

export async function GET() {
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

  const { data: latest } = await admin
    .from('vc_fund_applications')
    .select('id, fund_name, status, submitted_at, rejection_reason, cfp_id')
    .eq('tenant_id', profile.tenant_id)
    .eq('created_by', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let applicationId = latest?.id as string | undefined;
  let questionnaireId: string | undefined;

  if (!applicationId) {
    const ensured = await ensureMyApplicationDraft(admin, profile.tenant_id, user.id);
    if ('error' in ensured) {
      return NextResponse.json({ error: ensured.error }, { status: 500 });
    }
    applicationId = ensured.applicationId;
    questionnaireId = ensured.questionnaireId;
  } else {
    const q = await ensureQuestionnaireForApplication(admin, profile.tenant_id, applicationId);
    if ('error' in q) {
      return NextResponse.json({ error: q.error }, { status: 500 });
    }
    questionnaireId = q.questionnaireId;
  }

  const { data: app } = await admin
    .from('vc_fund_applications')
    .select('id, fund_name, status, submitted_at, rejection_reason, cfp_id')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  let cfp: { id: string; title: string; status: string; closing_date: string } | null = null;
  const appRow = app as { cfp_id?: string | null } | null;
  if (appRow?.cfp_id) {
    const { data: cfpRow } = await admin
      .from('vc_cfps')
      .select('id, title, status, closing_date')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', appRow.cfp_id)
      .maybeSingle();
    if (cfpRow) {
      const r = cfpRow as { id: string; title: string; status: string; closing_date: string };
      cfp = { id: r.id, title: r.title, status: r.status, closing_date: r.closing_date };
    }
  }

  return NextResponse.json({
    application_id: applicationId,
    questionnaire_id: questionnaireId ?? null,
    application: app,
    cfp,
  });
}
