import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ensurePreScreeningChecklist } from '@/lib/pre-screening/ensure-checklist';
import { loadQuestionnaireAnswersSummary } from '@/lib/questionnaire/load-questionnaire-answers-summary';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || (!can(profile, 'score:assessment') && !can(profile, 'write:applications'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: app, error: aErr } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, status, submitted_at, rejection_reason')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (aErr || !app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: qn } = await supabase
    .from('vc_dd_questionnaires')
    .select('id, status, completed_at')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('id, status, overall_score, passed, completed_at')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let criteria: unknown[] = [];
  if (assessment?.id) {
    const { data: crit } = await supabase
      .from('vc_assessment_criteria')
      .select(
        'id, criteria_key, criteria_weight, max_points, raw_score, weighted_score, ai_reasoning, override_score, override_reason',
      )
      .eq('tenant_id', profile.tenant_id)
      .eq('assessment_id', assessment.id);
    criteria = crit ?? [];
  }

  const pre = await ensurePreScreeningChecklist(supabase, profile.tenant_id, applicationId);
  const questionnaireSnapshot =
    qn?.id != null
      ? await loadQuestionnaireAnswersSummary(supabase, profile.tenant_id, qn.id)
      : null;

  return NextResponse.json({
    application: app,
    questionnaire: qn,
    assessment,
    criteria,
    pre_screening: 'error' in pre ? null : { checklist: pre.checklist, items: pre.items },
    questionnaire_snapshot: questionnaireSnapshot,
  });
}
