import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { criteriaRowsForAssessment, subcriteriaRowsForCriteria } from '@/lib/scoring/seed-structure';
import type { CriteriaKey } from '@/lib/scoring/config';
import { CRITERIA_ORDER } from '@/lib/scoring/config';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type PostBody = {
  application_id: string;
  questionnaire_id: string;
};

export async function POST(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'create:assessment')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.application_id || !body.questionnaire_id) {
    return NextResponse.json({ error: 'application_id and questionnaire_id required' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id')
    .eq('id', body.application_id)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const { data: qn } = await supabase
    .from('vc_dd_questionnaires')
    .select('id, application_id')
    .eq('id', body.questionnaire_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!qn || qn.application_id !== body.application_id) {
    return NextResponse.json({ error: 'Questionnaire not found for application' }, { status: 400 });
  }

  const { data: assessment, error: insA } = await supabase
    .from('vc_assessments')
    .insert({
      tenant_id: profile.tenant_id,
      application_id: body.application_id,
      questionnaire_id: body.questionnaire_id,
      evaluator_id: user.id,
      status: 'draft',
      pass_threshold: 70,
    })
    .select('id')
    .single();

  if (insA || !assessment) {
    return NextResponse.json({ error: insA?.message ?? 'Failed to create assessment' }, { status: 500 });
  }

  const critRows = criteriaRowsForAssessment(profile.tenant_id, assessment.id);
  const { data: insertedCrit, error: insC } = await supabase
    .from('vc_assessment_criteria')
    .insert(critRows)
    .select('id, criteria_key');

  if (insC || !insertedCrit?.length) {
    await supabase.from('vc_assessments').delete().eq('id', assessment.id).eq('tenant_id', profile.tenant_id);
    return NextResponse.json({ error: insC?.message ?? 'Failed to seed criteria' }, { status: 500 });
  }

  const idByKey = new Map(
    insertedCrit.map((r: { id: string; criteria_key: string }) => [r.criteria_key as CriteriaKey, r.id]),
  );

  for (const key of CRITERIA_ORDER) {
    const cid = idByKey.get(key);
    if (!cid) continue;
    const subs = subcriteriaRowsForCriteria(profile.tenant_id, cid, key).map((s) => ({
      ...s,
      criteria_id: cid,
    }));
    const { error: insS } = await supabase.from('vc_assessment_subcriteria').insert(subs);
    if (insS) {
      return NextResponse.json({ error: insS.message }, { status: 500 });
    }
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'assessment',
    entityId: assessment.id,
    action: 'created',
    afterState: { status: 'draft', application_id: body.application_id, questionnaire_id: body.questionnaire_id },
  });

  return NextResponse.json({ id: assessment.id });
}
