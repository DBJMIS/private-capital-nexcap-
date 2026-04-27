import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog } from '@/lib/audit/log';
import { loadDdDecisionAggregation } from '@/lib/applications/dd-decision-loader';
import { ensureDdSections } from '@/lib/questionnaire/ensure-questionnaire';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  decision: 'full_dd' | 'conditional_dd' | 'no_dd';
  strong_points?: string | null;
  weak_points?: string | null;
  conditions?: string | null;
  rejection_reason?: string | null;
};

function isDecision(v: string): v is Body['decision'] {
  return v === 'full_dd' || v === 'conditional_dd' || v === 'no_dd';
}

function parseAiRecommendation(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = String((raw as Record<string, unknown>).recommendation ?? '');
  if (r === 'full_dd' || r === 'conditional_dd' || r === 'no_dd') return r;
  return null;
}

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const bundle = await loadDdDecisionAggregation(supabase, profile.tenant_id, applicationId);
  if (!bundle.ok) {
    return NextResponse.json({ data: null, error: bundle.error }, { status: bundle.status });
  }

  const { data: qnRow } = await supabase
    .from('vc_dd_questionnaires')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();

  const row = bundle.dd_row;
  const existing_decision =
    row?.final_decision === 'full_dd' || row?.final_decision === 'conditional_dd' || row?.final_decision === 'no_dd'
      ? {
          decision: row.final_decision as Body['decision'],
          strong_points: row.strong_points,
          weak_points: row.weak_points,
          conditions: row.conditions,
          rejection_reason: row.rejection_reason,
          decided_at: row.decided_at,
          decided_by: row.decider_name ?? row.decided_by,
          decision_overrides_ai: row.decision_overrides_ai,
        }
      : null;

  return NextResponse.json({
    data: {
      fund_name: bundle.fund_name,
      application_status: bundle.application_status,
      panel_evaluation_count: bundle.panel_evaluation_count,
      vote_totals: bundle.vote_totals,
      criteria_aggregates: bundle.criteria_aggregates,
      category_averages: bundle.category_averages,
      overall_average: bundle.overall_average,
      existing_decision,
      questionnaire_id: (qnRow as { id: string } | null)?.id ?? null,
      ai_recommendation: row?.ai_recommendation ?? null,
      ai_recommended_at: row?.ai_recommended_at ?? null,
      ai_weighted_score: row?.ai_weighted_score ?? null,
    },
    error: null,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const authUser = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isDecision(String(body.decision ?? ''))) {
    return NextResponse.json({ data: null, error: 'decision must be full_dd, conditional_dd, or no_dd' }, { status: 400 });
  }

  const strong_points = String(body.strong_points ?? '').trim();
  const weak_points = String(body.weak_points ?? '').trim();
  const conditions = String(body.conditions ?? '').trim() || null;
  const rejection_reason = String(body.rejection_reason ?? '').trim() || null;

  const supabase = createServerClient();
  const bundle = await loadDdDecisionAggregation(supabase, profile.tenant_id, applicationId);
  if (!bundle.ok) {
    return NextResponse.json({ data: null, error: bundle.error }, { status: bundle.status });
  }

  const aiSuggested = parseAiRecommendation(bundle.dd_row?.ai_recommendation);
  const decision_overrides_ai = aiSuggested != null && aiSuggested !== body.decision;

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!app) return NextResponse.json({ data: null, error: 'Application not found' }, { status: 404 });

  const beforeStatus = (app as { status: string }).status;
  const targetStatus = body.decision === 'no_dd' ? 'rejected' : 'dd_recommended';
  const appRejectionReason = body.decision === 'no_dd' ? rejection_reason : null;

  // Do not set vc_fund_applications.rejection_reason here: some DBs lack that column until
  // migration 20260421000000 (or 20260416120000). NDD explanation is stored on vc_dd_decisions.
  const { error: updateError } = await supabase
    .from('vc_fund_applications')
    .update({ status: targetStatus })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId);

  if (updateError) return NextResponse.json({ data: null, error: updateError.message }, { status: 500 });

  let questionnaireId: string | null = null;
  if (body.decision !== 'no_dd') {
    const { data: existingQn } = await supabase
      .from('vc_dd_questionnaires')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('application_id', applicationId)
      .maybeSingle();

    if (existingQn) {
      questionnaireId = (existingQn as { id: string }).id;
    } else {
      const { data: insertedQn, error: qnError } = await supabase
        .from('vc_dd_questionnaires')
        .insert({
          tenant_id: profile.tenant_id,
          application_id: applicationId,
          status: 'draft',
          assigned_to: null,
        })
        .select('id')
        .single();
      if (qnError || !insertedQn) {
        return NextResponse.json({ data: null, error: qnError?.message ?? 'Failed to create questionnaire' }, { status: 500 });
      }
      questionnaireId = (insertedQn as { id: string }).id;
    }

    if (questionnaireId) {
      const sec = await ensureDdSections(supabase, profile.tenant_id, questionnaireId);
      if (sec.error) {
        return NextResponse.json({ data: null, error: sec.error }, { status: 500 });
      }
    }
  }

  const deciderName = profile.full_name?.trim() || profile.email?.trim() || null;
  const decidedAt = new Date().toISOString();

  const decisionPayload = {
    tenant_id: profile.tenant_id,
    application_id: applicationId,
    strong_points,
    weak_points,
    conditions: body.decision === 'conditional_dd' ? conditions : null,
    rejection_reason: body.decision === 'no_dd' ? rejection_reason : null,
    final_decision: body.decision,
    decision_overrides_ai,
    decided_by: authUser.id,
    decider_name: deciderName,
    decided_at: decidedAt,
  };

  if (bundle.dd_row?.id) {
    const { error: ddErr } = await supabase
      .from('vc_dd_decisions')
      .update(decisionPayload)
      .eq('tenant_id', profile.tenant_id)
      .eq('id', bundle.dd_row.id);
    if (ddErr) return NextResponse.json({ data: null, error: ddErr.message }, { status: 500 });
  } else {
    const { error: ddErr } = await supabase.from('vc_dd_decisions').insert({
      ...decisionPayload,
      ai_recommendation: null,
      ai_recommended_at: null,
      ai_weighted_score: null,
    });
    if (ddErr) return NextResponse.json({ data: null, error: ddErr.message }, { status: 500 });
  }

  const { data: updatedApp, error: fetchErr } = await supabase
    .from('vc_fund_applications')
    .select(
      'id, fund_name, manager_name, status, submitted_at, country_of_incorporation, geographic_area, total_capital_commitment_usd, cfp_id',
    )
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchErr || !updatedApp) {
    return NextResponse.json({ data: null, error: fetchErr?.message ?? 'Failed to load application' }, { status: 500 });
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: authUser.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'dd_decision_recorded',
    beforeState: { status: beforeStatus },
    afterState: { status: targetStatus },
    metadata: {
      decision: body.decision,
      strong_points,
      weak_points,
      conditions: body.decision === 'conditional_dd' ? conditions : null,
      rejection_reason: appRejectionReason,
      decided_by: deciderName,
      decision_overrides_ai,
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      application: updatedApp,
      application_status: (updatedApp as { status: string }).status,
      questionnaire_id: questionnaireId,
      dd_decision: {
        decision: body.decision,
        strong_points,
        weak_points,
        conditions: body.decision === 'conditional_dd' ? conditions : null,
        rejection_reason: appRejectionReason,
        decided_at: decidedAt,
        decision_overrides_ai,
        decider_name: deciderName,
      },
    },
    error: null,
  });
}
