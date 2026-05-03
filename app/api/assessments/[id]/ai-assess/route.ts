import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { logAndReturn } from '@/lib/api/errors';
import {
  buildDdAiAssessUserPrompt,
  DD_AI_ASSESS_SYSTEM,
  parseAiDdAssessmentJson,
} from '@/lib/assessment/dd-ai-assess-prompt';
import { loadQuestionnaireBundle } from '@/lib/assessment/questionnaire-bundle';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

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

  const { data: assessment, error: aErr } = await supabase
    .from('vc_assessments')
    .select('id, questionnaire_id, application_id, status, tenant_id')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (aErr || !assessment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const row = assessment as {
    id: string;
    questionnaire_id: string | null;
    application_id: string;
    status: string;
  };

  if (row.status === 'completed' || row.status === 'approved') {
    return NextResponse.json({ error: 'Assessment is locked' }, { status: 400 });
  }

  if (!row.questionnaire_id) {
    return NextResponse.json({ error: 'No questionnaire linked to this assessment' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('fund_name, manager_name, country_of_incorporation, geographic_area, total_capital_commitment_usd')
    .eq('id', row.application_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  const appRow = app as {
    fund_name: string;
    manager_name: string;
    country_of_incorporation: string;
    geographic_area: string;
    total_capital_commitment_usd: number;
  } | null;

  const bundle = await loadQuestionnaireBundle(supabase, profile.tenant_id, row.questionnaire_id);
  if (!bundle) {
    return NextResponse.json({ error: 'Questionnaire not found' }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 });
  }

  const userPrompt = buildDdAiAssessUserPrompt({
    fundName: appRow?.fund_name ?? 'Fund',
    managerName: appRow?.manager_name ?? 'Manager',
    country: appRow?.country_of_incorporation ?? '',
    geography: appRow?.geographic_area ?? '',
    capitalUsd: appRow?.total_capital_commitment_usd ?? null,
    bundle,
  });

  const anthropic = new Anthropic({ apiKey });
  let text = '';
  try {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      system: DD_AI_ASSESS_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    text = msg.content.find((c) => c.type === 'text' && 'text' in c)?.text ?? '';
  } catch (e) {
    return logAndReturn(
      e,
      'assessments/ai-assess',
      'UPSTREAM_ERROR',
      'AI assessment service unavailable — please retry',
      502,
    );
  }

  const parsed = parseAiDdAssessmentJson(text);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, raw_preview: text.slice(0, 500) }, { status: 422 });
  }

  const data = parsed.data;
  const aiSubStored = {
    criteria: data.criteria,
    strengths: data.strengths ?? [],
    concerns: data.concerns ?? [],
    suggested_recommendation: data.suggested_recommendation ?? null,
    suggested_recommendation_reasoning: data.suggested_recommendation_reasoning ?? null,
    fund_name: data.fund_name ?? appRow?.fund_name ?? null,
  };

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from('vc_assessments')
    .update({
      ai_overall_assessment: data.overall_assessment ?? null,
      ai_subcriteria_suggestions: aiSubStored as unknown as Record<string, unknown>,
      ai_assessed_at: nowIso,
    })
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ai_assessed_at: nowIso,
    ai_overall_assessment: data.overall_assessment ?? null,
    ai_subcriteria_suggestions: aiSubStored,
  });
}
