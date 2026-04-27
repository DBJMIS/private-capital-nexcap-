import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  criteria_id: string;
  override_score: number;
  override_reason: string;
};

export async function POST(req: Request, ctx: Ctx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'score:assessment')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.criteria_id || typeof body.override_score !== 'number' || !body.override_reason?.trim()) {
    return NextResponse.json({ error: 'criteria_id, override_score (1-5), override_reason required' }, { status: 400 });
  }

  if (body.override_score < 1 || body.override_score > 5) {
    return NextResponse.json({ error: 'override_score must be 1-5' }, { status: 400 });
  }

  const { data: crit } = await supabase
    .from('vc_assessment_criteria')
    .select('id, assessment_id, criteria_weight, max_points')
    .eq('id', body.criteria_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!crit) return NextResponse.json({ error: 'Criteria not found' }, { status: 404 });

  const { data: asmt } = await supabase
    .from('vc_assessments')
    .select('id, application_id')
    .eq('id', crit.assessment_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!asmt || asmt.application_id !== applicationId) {
    return NextResponse.json({ error: 'Mismatch' }, { status: 400 });
  }

  const weight = Number(crit.criteria_weight);
  const weighted = (body.override_score / 5) * weight;

  const { error: up } = await supabase
    .from('vc_assessment_criteria')
    .update({
      override_score: body.override_score,
      override_reason: body.override_reason.trim(),
      override_by: user.id,
      raw_score: body.override_score,
      weighted_score: weighted,
    })
    .eq('id', crit.id)
    .eq('tenant_id', profile.tenant_id);

  if (up) return NextResponse.json({ error: up.message }, { status: 500 });

  const { data: all } = await supabase
    .from('vc_assessment_criteria')
    .select('weighted_score')
    .eq('tenant_id', profile.tenant_id)
    .eq('assessment_id', asmt.id);

  let overall = 0;
  for (const c of all ?? []) {
    overall += Number(c.weighted_score ?? 0);
  }
  overall = Math.round(overall * 100) / 100;
  const passed = overall >= 70;

  await supabase
    .from('vc_assessments')
    .update({ overall_score: overall, overall_weighted_score: overall, passed })
    .eq('id', asmt.id)
    .eq('tenant_id', profile.tenant_id);

  return NextResponse.json({ ok: true, overall_score: overall, passed });
}
