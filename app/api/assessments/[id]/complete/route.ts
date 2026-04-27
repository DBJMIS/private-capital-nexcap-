import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { generateAndPersistAssessmentNarrative } from '@/lib/assessment/generate-assessment-narrative';
import { CRITERIA_ORDER, type CriteriaKey } from '@/lib/scoring/config';
import {
  buildSectionResults,
  calculateWeightedScore,
  determineOutcome,
} from '@/lib/scoring/calculate';
import { allSubcriteriaFilled } from '@/lib/scoring/recompute';
import { scheduleAuditLog } from '@/lib/audit/log';

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

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('*')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (assessment.status === 'completed' || assessment.status === 'approved') {
    return NextResponse.json({ error: 'Assessment already completed' }, { status: 400 });
  }

  const filled = await allSubcriteriaFilled(supabase, profile.tenant_id, assessmentId);
  if (!filled) {
    return NextResponse.json(
      { error: 'All subcriteria must be scored before completing the assessment' },
      { status: 400 },
    );
  }

  const { data: criteria } = await supabase
    .from('vc_assessment_criteria')
    .select('id, criteria_key')
    .eq('assessment_id', assessmentId)
    .eq('tenant_id', profile.tenant_id);

  const critByKey = new Map(
    (criteria ?? []).map((c: { id: string; criteria_key: string }) => [c.criteria_key as CriteriaKey, c.id]),
  );

  const sectionInputs = [];
  for (const key of CRITERIA_ORDER) {
    const cid = critByKey.get(key);
    if (!cid) {
      return NextResponse.json({ error: 'Incomplete criteria rows' }, { status: 500 });
    }
    const { data: subs } = await supabase
      .from('vc_assessment_subcriteria')
      .select('subcriteria_key, score')
      .eq('criteria_id', cid)
      .eq('tenant_id', profile.tenant_id);

    const subcriteria = (subs ?? []).map((s: { subcriteria_key: string; score: number }) => ({
      key: s.subcriteria_key,
      score: Number(s.score),
    }));
    sectionInputs.push({ criteriaKey: key, subcriteria });
  }

  const { sections, errors } = buildSectionResults(sectionInputs);
  if (errors.length) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
  }

  const overall = calculateWeightedScore(sections);
  const outcome = determineOutcome(overall);

  const { data: dbCrit } = await supabase
    .from('vc_assessment_criteria')
    .select('criteria_key, weighted_score')
    .eq('assessment_id', assessmentId)
    .eq('tenant_id', profile.tenant_id);

  let dbOverall = 0;
  for (const c of dbCrit ?? []) {
    if (c.weighted_score === null || c.weighted_score === undefined) {
      return NextResponse.json(
        { error: 'Server could not derive weighted scores; save each section again.' },
        { status: 400 },
      );
    }
    dbOverall += Number(c.weighted_score);
  }
  dbOverall = Math.round(dbOverall * 100) / 100;

  if (Math.abs(dbOverall - overall) > 0.05) {
    return NextResponse.json(
      {
        error: 'Score mismatch — server recomputation differs from client; refresh and retry.',
        server: dbOverall,
        recalculated: overall,
      },
      { status: 409 },
    );
  }

  const { error: upA } = await supabase
    .from('vc_assessments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      overall_score: overall,
      overall_weighted_score: overall,
      passed: outcome.passed,
      recommendation: outcome.recommendation,
    })
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id);

  if (upA) return NextResponse.json({ error: upA.message }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'assessment',
    entityId: assessmentId,
    action: 'completed',
    beforeState: { status: assessment.status as string, overall_score: assessment.overall_score },
    afterState: {
      status: 'completed',
      overall_score: overall,
      passed: outcome.passed,
      recommendation: outcome.recommendation,
      band: outcome.band,
    },
  });

  let ai_narrative_error: string | undefined;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicModel = process.env.ANTHROPIC_MODEL?.trim();
  if (apiKey && anthropicModel) {
    const gen = await generateAndPersistAssessmentNarrative({
      supabase,
      tenantId: profile.tenant_id,
      assessmentId,
      anthropicApiKey: apiKey,
    });
    if (!gen.ok) ai_narrative_error = gen.error;
  } else if (!apiKey) {
    ai_narrative_error = 'ANTHROPIC_API_KEY is not configured; AI narrative was not generated.';
  } else {
    ai_narrative_error = 'ANTHROPIC_MODEL is not configured; AI narrative was not generated.';
  }

  return NextResponse.json({
    overall_score: overall,
    passed: outcome.passed,
    recommendation: outcome.recommendation,
    band: outcome.band,
    label: outcome.label,
    recommendation_label: outcome.recommendationLabel,
    ...(ai_narrative_error ? { ai_narrative_error } : {}),
  });
}
