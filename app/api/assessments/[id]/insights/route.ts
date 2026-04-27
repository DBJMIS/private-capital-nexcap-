import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { generateInsights, insightInputsFromScores } from '@/lib/scoring/insights';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: assessmentId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('id')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: criteria } = await supabase
    .from('vc_assessment_criteria')
    .select('criteria_key, raw_score, max_points')
    .eq('assessment_id', assessmentId)
    .eq('tenant_id', profile.tenant_id);

  const inputs = insightInputsFromScores(criteria ?? []);
  const insights = generateInsights(inputs);

  return NextResponse.json({ insights });
}
