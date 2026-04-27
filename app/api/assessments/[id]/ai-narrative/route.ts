import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { AI_NARRATIVE_DISCLAIMER, isAssessmentAiNarrative, type AssessmentAiNarrative } from '@/lib/assessment/ai-narrative-types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type PutBody = {
  executive_summary?: string;
  strengths?: string[];
  concerns?: string[];
  red_flags?: string[];
  recommended_conditions?: string[];
  ic_questions?: string[];
};

function mayAccessAssessment(
  profile: { user_id: string; role: string },
  assessment: { evaluator_id: string; status: string },
): boolean {
  if (profile.role === 'admin') return true;
  return assessment.evaluator_id === profile.user_id;
}

function mergeNarrative(current: AssessmentAiNarrative, body: PutBody, editorUserId: string): AssessmentAiNarrative {
  const now = new Date().toISOString();
  const strArr = (x: unknown, fallback: string[]) =>
    Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').map((s) => s.trim()) : fallback;

  return {
    ...current,
    disclaimer_label: AI_NARRATIVE_DISCLAIMER,
    executive_summary:
      typeof body.executive_summary === 'string' ? body.executive_summary.trim() : current.executive_summary,
    strengths: body.strengths !== undefined ? strArr(body.strengths, current.strengths) : current.strengths,
    concerns: body.concerns !== undefined ? strArr(body.concerns, current.concerns) : current.concerns,
    red_flags: body.red_flags !== undefined ? strArr(body.red_flags, current.red_flags) : current.red_flags,
    recommended_conditions:
      body.recommended_conditions !== undefined
        ? strArr(body.recommended_conditions, current.recommended_conditions)
        : current.recommended_conditions,
    ic_questions:
      body.ic_questions !== undefined ? strArr(body.ic_questions, current.ic_questions) : current.ic_questions,
    meta: {
      ...current.meta,
      last_edited_at: now,
      last_edited_by_user_id: editorUserId,
    },
  };
}

export async function PUT(req: Request, ctx: Ctx) {
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

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('id, status, evaluator_id, ai_narrative')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!mayAccessAssessment(profile, assessment)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (assessment.status !== 'completed' && assessment.status !== 'approved') {
    return NextResponse.json({ error: 'Narrative can only be edited after completion' }, { status: 400 });
  }

  const raw = assessment.ai_narrative;
  if (!raw || !isAssessmentAiNarrative(raw)) {
    return NextResponse.json({ error: 'No AI narrative to update; generate insights first' }, { status: 400 });
  }

  const next = mergeNarrative(raw, body, profile.user_id);
  if (!next.executive_summary) {
    return NextResponse.json({ error: 'executive_summary cannot be empty' }, { status: 400 });
  }

  const { error: up } = await supabase
    .from('vc_assessments')
    .update({ ai_narrative: next as unknown as Record<string, unknown> })
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id);

  if (up) return NextResponse.json({ error: up.message }, { status: 500 });

  return NextResponse.json({ ok: true, ai_narrative: next });
}
