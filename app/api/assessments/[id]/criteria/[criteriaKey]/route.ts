import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import type { CriteriaKey } from '@/lib/scoring/config';
import { CRITERIA_ORDER, getCriteriaDef } from '@/lib/scoring/config';
import { recomputeCriteriaAndAssessment } from '@/lib/scoring/recompute';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; criteriaKey: string }> };

type PutBody = {
  subcriteria: Array<{ subcriteria_key: string; score: number | null; notes?: string | null }>;
};

export async function PUT(req: Request, ctx: Ctx) {
  const { id: assessmentId, criteriaKey: rawKey } = await ctx.params;
  const criteriaKey = rawKey as CriteriaKey;

  if (!CRITERIA_ORDER.includes(criteriaKey)) {
    return NextResponse.json({ error: 'Invalid criteria key' }, { status: 400 });
  }

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

  if (!Array.isArray(body.subcriteria)) {
    return NextResponse.json({ error: 'subcriteria array required' }, { status: 400 });
  }

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('id, status')
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (assessment.status === 'approved') {
    return NextResponse.json({ error: 'Assessment is approved and cannot be edited' }, { status: 400 });
  }
  if (assessment.status === 'completed' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Completed assessments are read-only' }, { status: 400 });
  }

  const def = getCriteriaDef(criteriaKey);
  if (!def) return NextResponse.json({ error: 'Invalid criteria' }, { status: 400 });

  for (const row of body.subcriteria) {
    const meta = def.subcriteria.find((s) => s.key === row.subcriteria_key);
    if (!meta) {
      return NextResponse.json({ error: `Unknown subcriteria: ${row.subcriteria_key}` }, { status: 400 });
    }
    if (row.score !== null && row.score !== undefined) {
      if (!Number.isFinite(row.score) || row.score < 0 || row.score > meta.maxPoints) {
        return NextResponse.json(
          { error: `${meta.label}: score must be 0–${meta.maxPoints}` },
          { status: 400 },
        );
      }
    }
  }

  const { data: crit } = await supabase
    .from('vc_assessment_criteria')
    .select('id, weighted_score, raw_score')
    .eq('assessment_id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .eq('criteria_key', criteriaKey)
    .maybeSingle();

  if (!crit) return NextResponse.json({ error: 'Criteria not found' }, { status: 404 });

  const { data: existingSubs } = await supabase
    .from('vc_assessment_subcriteria')
    .select('id, subcriteria_key')
    .eq('criteria_id', crit.id)
    .eq('tenant_id', profile.tenant_id);

  const byKey = new Map((existingSubs ?? []).map((r: { id: string; subcriteria_key: string }) => [r.subcriteria_key, r.id]));

  for (const row of body.subcriteria) {
    const sid = byKey.get(row.subcriteria_key);
    if (!sid) {
      return NextResponse.json({ error: `Unknown subcriteria key ${row.subcriteria_key}` }, { status: 400 });
    }
    const { error: u } = await supabase
      .from('vc_assessment_subcriteria')
      .update({
        score: row.score,
        notes: row.notes === undefined ? undefined : row.notes,
      })
      .eq('id', sid)
      .eq('tenant_id', profile.tenant_id);

    if (u) return NextResponse.json({ error: u.message }, { status: 500 });
  }

  if (assessment.status === 'draft') {
    const { error: st } = await supabase
      .from('vc_assessments')
      .update({ status: 'in_progress' })
      .eq('id', assessmentId)
      .eq('tenant_id', profile.tenant_id)
      .eq('status', 'draft');
    if (st) return NextResponse.json({ error: st.message }, { status: 500 });
  }

  const beforeWeighted = crit?.weighted_score != null ? Number(crit.weighted_score) : null;
  const beforeRaw = crit?.raw_score != null ? Number(crit.raw_score) : null;

  const rec = await recomputeCriteriaAndAssessment(supabase, profile.tenant_id, assessmentId, criteriaKey);
  if (rec.error) return NextResponse.json({ error: rec.error }, { status: 500 });

  const { data: critAfter } = await supabase
    .from('vc_assessment_criteria')
    .select('weighted_score, raw_score')
    .eq('assessment_id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .eq('criteria_key', criteriaKey)
    .maybeSingle();

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'assessment',
    entityId: assessmentId,
    action: 'section_scored',
    beforeState: { criteria_key: criteriaKey, weighted_score: beforeWeighted, raw_score: beforeRaw },
    afterState: {
      criteria_key: criteriaKey,
      weighted_score: critAfter?.weighted_score != null ? Number(critAfter.weighted_score) : null,
      raw_score: critAfter?.raw_score != null ? Number(critAfter.raw_score) : null,
    },
  });

  return NextResponse.json({ ok: true });
}
