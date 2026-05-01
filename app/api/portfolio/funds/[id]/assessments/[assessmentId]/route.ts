import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { fetchAssessmentConfigRow } from '@/lib/portfolio/assessment-helpers';
import {
  computeEffectiveWeights,
  computeWeightedScore,
  deriveCategory,
  deriveRecommendation,
} from '@/lib/portfolio/assessment-scoring';
import {
  QUARTERLY_ASSESSMENT_DIMENSION_KEYS as DIMENSIONS,
  quarterlyAssessmentScoreField as scoreField,
  readQuarterlyAssessmentScore as readScore,
  validateQuarterlyAssessmentSubmitReady as validateSubmitted,
} from '@/lib/portfolio/quarterly-assessment-submit-validation';
import { updateWatchlistAfterApproval } from '@/lib/portfolio/watchlist-service';
import { createServerClient } from '@/lib/supabase/server';
import type { DimensionKey } from '@/lib/portfolio/types';
import type { VcQuarterlyAssessment } from '@/types/database';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; assessmentId: string }> };

type OverrideInput = {
  score: number;
  reason: string;
};

function parseDimensionOverrides(input: unknown): Partial<Record<DimensionKey, OverrideInput>> {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const out: Partial<Record<DimensionKey, OverrideInput>> = {};
  for (const d of DIMENSIONS) {
    const v = raw[d];
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const score = Number(o.score);
    const reason = typeof o.reason === 'string' ? o.reason.trim() : '';
    if (Number.isFinite(score)) out[d] = { score, reason };
  }
  return out;
}

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId, assessmentId } = await ctx.params;
  const supabase = createServerClient();

  const { data: row, error } = await supabase
    .from('vc_quarterly_assessments')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', assessmentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const r = row as VcQuarterlyAssessment;
  const ddId = (r.dd_assessment_id ?? null) as string | null;
  const { data: ddRef } = ddId
    ? await supabase
        .from('vc_assessments')
        .select('id, recommendation, overall_weighted_score, overall_score, completed_at')
        .eq('tenant_id', profile.tenant_id)
        .eq('id', ddId)
        .maybeSingle()
    : { data: null };
  const ids = [r.assessed_by, r.approved_by].filter((x): x is string => !!x);
  const { data: profs } = ids.length
    ? await supabase.from('vc_profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string }[] };
  const nm = new Map((profs ?? []).map((p) => [p.id as string, (p as { full_name: string }).full_name]));

  return NextResponse.json({
    assessment: {
      ...r,
      dd_reference: ddRef
        ? {
            id: (ddRef as { id: string }).id,
            recommendation: (ddRef as { recommendation: string | null }).recommendation,
            score:
              (ddRef as { overall_weighted_score: number | null; overall_score: number | null }).overall_weighted_score ??
              (ddRef as { overall_weighted_score: number | null; overall_score: number | null }).overall_score ??
              null,
            completed_at: (ddRef as { completed_at: string | null }).completed_at,
          }
        : null,
      assessed_by_name: r.assessed_by ? nm.get(r.assessed_by) ?? '—' : null,
      approved_by_name: r.approved_by ? nm.get(r.approved_by) ?? '—' : null,
    },
  });
}

export async function PUT(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id: fundId, assessmentId } = await ctx.params;
  const body = (await req.json()) as Record<string, unknown>;

  const supabase = createServerClient();

  const { data: existing, error: exErr } = await supabase
    .from('vc_quarterly_assessments')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .eq('id', assessmentId)
    .maybeSingle();

  if (exErr || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const cur = existing as VcQuarterlyAssessment;
  const next: VcQuarterlyAssessment = { ...cur, ...(body as Partial<VcQuarterlyAssessment>) };
  const requestedStatus = (body.status as string | undefined) ?? cur.status;

  const finalizingFromDraft =
    cur.status === 'draft' && (requestedStatus === 'submitted' || requestedStatus === 'approved');
  if (finalizingFromDraft) {
    const err = validateSubmitted(next);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  if (requestedStatus === 'draft' && cur.status === 'submitted') {
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only administrators can return an assessment for revision.' }, { status: 403 });
    }
  }

  const { row: cfgRow, defaults: cfgDef } = await fetchAssessmentConfigRow(supabase, profile.tenant_id);
  const cfg = cfgRow ?? cfgDef;
  const stage = cur.fund_lifecycle_stage as 'early' | 'mid' | 'late';
  const weights = computeEffectiveWeights(cfg, stage);

  const scores: Partial<Record<DimensionKey, number>> = {};
  const existingOverrides = ((cur.dimension_overrides ?? {}) as Record<string, unknown>) ?? {};
  const incomingOverrides = parseDimensionOverrides(body.dimension_overrides);
  const mergedOverrides = { ...existingOverrides };
  for (const d of DIMENSIONS) {
    const ov = incomingOverrides[d];
    if (!ov) continue;
    if (!ov.reason) {
      return NextResponse.json({ error: `Override reason is required for ${d}.` }, { status: 400 });
    }
    mergedOverrides[d] = { score: ov.score, reason: ov.reason };
  }
  for (const d of DIMENSIONS) {
    const ov = mergedOverrides[d] as { score?: unknown } | undefined;
    const ovScore = ov?.score != null ? Number(ov.score) : null;
    if (ovScore != null && Number.isFinite(ovScore)) {
      scores[d] = ovScore;
      continue;
    }
    const v = readScore(next, d);
    if (v != null) scores[d] = v;
  }
  const allPresent = DIMENSIONS.every((d) => scores[d] != null);
  const weighted = allPresent ? computeWeightedScore(scores, weights) : null;

  const allowed = new Set([
    'status',
    'financial_performance_score',
    'development_impact_score',
    'fund_management_score',
    'compliance_governance_score',
    'portfolio_health_score',
    'financial_commentary',
    'impact_commentary',
    'management_commentary',
    'compliance_commentary',
    'portfolio_commentary',
    'overall_summary',
    'ai_summary',
    'contractual_obligation',
    'recommendation_override_reason',
    'dimension_overrides',
    'dimension_reasoning',
    'source_snippets',
    'narrative_extract_id',
  ]);
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) continue;
    if (k === 'status' && body.status === 'submitted' && cur.status !== 'draft') {
      continue;
    }
    patch[k] = body[k];
  }
  if (requestedStatus === 'submitted' && cur.status === 'draft') {
    patch.status = 'approved';
  }
  const becomesApproved =
    (cur.status === 'draft' && (requestedStatus === 'submitted' || requestedStatus === 'approved')) ||
    (cur.status === 'submitted' && requestedStatus === 'approved');
  if (becomesApproved) {
    patch.approved_by = profile.profile_id;
    patch.approved_at = new Date().toISOString();
  }
  if (requestedStatus === 'draft' && cur.status === 'submitted') {
    patch.approved_by = null;
    patch.approved_at = null;
  }
  if (weighted != null) {
    patch.weighted_total_score = weighted;
    const cat = deriveCategory(weighted, cfg);
    patch.category = cat;
    patch.divestment_recommendation = deriveRecommendation(cat, !!next.contractual_obligation);
  }
  if (Object.keys(incomingOverrides).length > 0) {
    patch.dimension_overrides = mergedOverrides;
    for (const d of DIMENSIONS) {
      const f = scoreField(d);
      const s = scores[d];
      if (s != null) patch[f] = s;
    }
  }

  const { data: updated, error: upErr } = await supabase
    .from('vc_quarterly_assessments')
    .update(patch)
    .eq('id', assessmentId)
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .select('*')
    .single();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });
  }

  const u = updated as VcQuarterlyAssessment;
  if (u.status === 'approved' && u.divestment_recommendation) {
    const wl = await updateWatchlistAfterApproval(supabase, {
      fundId,
      tenantId: profile.tenant_id,
      recommendation: u.divestment_recommendation,
      assessmentId: u.id,
      config: cfg,
    });
    if (!wl.ok) {
      return NextResponse.json({ error: wl.error }, { status: 500 });
    }
  }

  return NextResponse.json({ assessment: updated });
}
