import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: assessment, error } = await supabase
    .from('vc_assessments')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (error || !assessment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('fund_name, manager_name, status')
    .eq('id', assessment.application_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  const { data: criteria } = await supabase
    .from('vc_assessment_criteria')
    .select('*')
    .eq('assessment_id', id)
    .eq('tenant_id', profile.tenant_id)
    .order('criteria_key', { ascending: true });

  const critIds = (criteria ?? []).map((c: { id: string }) => c.id);
  let subs: unknown[] = [];
  if (critIds.length) {
    const { data: subRows } = await supabase
      .from('vc_assessment_subcriteria')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('criteria_id', critIds)
      .order('subcriteria_key', { ascending: true });
    subs = subRows ?? [];
  }

  const { data: evalProfile } = await supabase
    .from('vc_profiles')
    .select('full_name, email')
    .eq('user_id', assessment.evaluator_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  const subByCrit = new Map<string, unknown[]>();
  for (const s of subs) {
    const cid = (s as { criteria_id: string }).criteria_id;
    const arr = subByCrit.get(cid) ?? [];
    arr.push(s);
    subByCrit.set(cid, arr);
  }

  const criteriaWithSubs = (criteria ?? []).map((c: { id: string }) => ({
    ...c,
    subcriteria: subByCrit.get(c.id) ?? [],
  }));

  return NextResponse.json({
    assessment,
    application: app,
    evaluator: evalProfile,
    criteria: criteriaWithSubs,
  });
}
