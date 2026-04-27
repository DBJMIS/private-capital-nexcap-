import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { generateAndPersistAssessmentNarrative } from '@/lib/assessment/generate-assessment-narrative';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function mayAccessAssessment(
  profile: { user_id: string; role: string },
  assessment: { evaluator_id: string; status: string },
): boolean {
  if (profile.role === 'admin') return true;
  return assessment.evaluator_id === profile.user_id;
}

export async function POST(_req: Request, ctx: Ctx) {
  const { id: assessmentId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'score:assessment')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('id, status, evaluator_id')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!mayAccessAssessment(profile, assessment)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (assessment.status !== 'completed' && assessment.status !== 'approved') {
    return NextResponse.json({ error: 'Assessment must be completed first' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicModel = process.env.ANTHROPIC_MODEL?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
  }
  if (!anthropicModel) {
    return NextResponse.json({ error: 'ANTHROPIC_MODEL is not configured' }, { status: 503 });
  }

  const result = await generateAndPersistAssessmentNarrative({
    supabase,
    tenantId: profile.tenant_id,
    assessmentId,
    anthropicApiKey: apiKey,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'assessment',
    entityId: assessmentId,
    action: 'ai_insights_generated',
    afterState: { narrative_generated: true },
    metadata: { source: 'generate_insights' },
  });

  return NextResponse.json({ ok: true, ai_narrative: result.narrative });
}
