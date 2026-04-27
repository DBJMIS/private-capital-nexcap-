import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog } from '@/lib/audit/log';
import { PANEL_CRITERIA, PANEL_CRITERION_KEYS, type PanelRating } from '@/lib/applications/panel-scoring';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type ScoreInput = { criterion_key: string; category: string; rating: PanelRating | null };
type EvaluationView = {
  id: string;
  panel_member_id: string;
  status: string;
  dd_vote: 'full_dd' | 'conditional_dd' | 'no_dd' | null;
  conditions: string | null;
  general_notes: string | null;
  submitted_at: string | null;
  ai_recommendation: Record<string, unknown> | null;
  ai_recommended_at: string | null;
  scores: Array<{ criterion_key: string; category: string; rating: PanelRating | null; notes: string | null }>;
};

type MemberRow = {
  id: string;
  member_name: string;
  member_organisation: string | null;
  member_email: string | null;
  member_type: string;
};

type PanelMemberSummary = {
  member: MemberRow;
  evaluation: EvaluationView | null;
  scores: EvaluationView['scores'];
  status: 'not_scored' | 'in_progress' | 'submitted';
};

function summaryStatus(evaluation: EvaluationView | null): PanelMemberSummary['status'] {
  const raw = evaluation?.status ?? 'pending';
  if (raw === 'submitted') return 'submitted';
  if (raw === 'in_progress') return 'in_progress';
  return 'not_scored';
}

function parseScores(raw: string): ScoreInput[] {
  try {
    const parsed = JSON.parse(raw) as ScoreInput[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isDdVote(v: string): v is 'full_dd' | 'conditional_dd' | 'no_dd' {
  return v === 'full_dd' || v === 'conditional_dd' || v === 'no_dd';
}

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, cfp_id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!app) return NextResponse.json({ data: null, error: 'Application not found' }, { status: 404 });

  const cfpId = (app as { cfp_id: string | null }).cfp_id;
  if (!cfpId) {
    return NextResponse.json({
      data: {
        members: [],
        member_summaries: [],
        evaluations: [],
        collated: [],
        vote_totals: { full_dd: 0, conditional_dd: 0, no_dd: 0 },
        dd_decision: null,
      },
      error: null,
    });
  }

  const { data: members, error: memErr } = await supabase
    .from('vc_panel_members')
    .select('id, member_name, member_organisation, member_email, member_type')
    .eq('tenant_id', profile.tenant_id)
    .eq('cfp_id', cfpId)
    .order('member_name', { ascending: true });
  if (memErr) return NextResponse.json({ data: null, error: memErr.message }, { status: 500 });

  const { data: evals, error: evalErr } = await supabase
    .from('vc_panel_evaluations')
    .select('id, panel_member_id, status, dd_vote, conditions, general_notes, submitted_at, ai_recommendation, ai_recommended_at')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId);
  if (evalErr) return NextResponse.json({ data: null, error: evalErr.message }, { status: 500 });

  const evaluationIds = (evals ?? []).map((e) => e.id as string);
  const { data: scores } = evaluationIds.length
    ? await supabase
        .from('vc_panel_evaluation_scores')
        .select('evaluation_id, category, criterion_key, rating, notes')
        .eq('tenant_id', profile.tenant_id)
        .in('evaluation_id', evaluationIds)
    : { data: [] as Array<Record<string, unknown>> };

  const scoreByEval = new Map<string, Array<Record<string, unknown>>>();
  for (const s of scores ?? []) {
    const id = String((s as { evaluation_id: string }).evaluation_id);
    const arr = scoreByEval.get(id) ?? [];
    arr.push(s as Record<string, unknown>);
    scoreByEval.set(id, arr);
  }

  const evaluations: EvaluationView[] = (evals ?? []).map((e) => {
    const row = e as {
      id: string;
      panel_member_id: string;
      status: string;
      dd_vote: 'full_dd' | 'conditional_dd' | 'no_dd' | null;
      conditions: string | null;
      general_notes: string | null;
      submitted_at: string | null;
      ai_recommendation: Record<string, unknown> | null;
      ai_recommended_at: string | null;
    };
    const aiRaw = row.ai_recommendation;
    const aiRec =
      aiRaw && typeof aiRaw === 'object' && !Array.isArray(aiRaw) ? (aiRaw as Record<string, unknown>) : null;
    return {
      id: row.id,
      panel_member_id: row.panel_member_id,
      status: row.status,
      dd_vote: row.dd_vote ?? null,
      conditions: row.conditions ?? null,
      general_notes: row.general_notes ?? null,
      submitted_at: row.submitted_at ?? null,
      ai_recommendation: aiRec,
      ai_recommended_at: row.ai_recommended_at ?? null,
      scores: (scoreByEval.get(row.id) ?? []).map((s) => ({
        criterion_key: String(s.criterion_key ?? ''),
        category: String(s.category ?? ''),
        rating: (s.rating as PanelRating | null) ?? null,
        notes: (s.notes as string | null) ?? null,
      })),
    };
  });

  const membersList: MemberRow[] = (members ?? []).map((m) => ({
    id: String((m as { id: string }).id),
    member_name: String((m as { member_name: string }).member_name),
    member_organisation: (m as { member_organisation: string | null }).member_organisation ?? null,
    member_email: (m as { member_email: string | null }).member_email ?? null,
    member_type: String((m as { member_type: string }).member_type),
  }));

  const member_summaries: PanelMemberSummary[] = membersList.map((member) => {
    const evaluation = evaluations.find((x) => x.panel_member_id === member.id) ?? null;
    return {
      member,
      evaluation,
      scores: evaluation?.scores ?? [],
      status: summaryStatus(evaluation),
    };
  });

  const collated = PANEL_CRITERIA.map((criterion) => {
    const ratings: Record<string, PanelRating | null> = {};
    for (const member of membersList) {
      const ev = evaluations.find((x) => String(x.panel_member_id) === member.id);
      const score = (ev?.scores as Array<{ criterion_key: string; rating: PanelRating | null }> | undefined)?.find(
        (r) => r.criterion_key === criterion.key,
      );
      ratings[member.id] = score?.rating ?? null;
    }
    return { criterion_key: criterion.key, label: criterion.label, ratings };
  });

  const vote_totals = {
    full_dd: evaluations.filter((e) => e.dd_vote === 'full_dd').length,
    conditional_dd: evaluations.filter((e) => e.dd_vote === 'conditional_dd').length,
    no_dd: evaluations.filter((e) => e.dd_vote === 'no_dd').length,
  };

  const { data: auditDecision } = await supabase
    .from('vc_audit_logs')
    .select('metadata, created_at')
    .eq('tenant_id', profile.tenant_id)
    .eq('entity_type', 'fund_application')
    .eq('entity_id', applicationId)
    .eq('action', 'dd_decision_recorded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const metadata = (auditDecision as { metadata?: Record<string, unknown>; created_at?: string } | null)?.metadata ?? {};
  const dd_decision = auditDecision
    ? {
        decision: String(metadata.decision ?? ''),
        strong_points: (metadata.strong_points as string | null) ?? null,
        weak_points: (metadata.weak_points as string | null) ?? null,
        conditions: (metadata.conditions as string | null) ?? null,
        rejection_reason: (metadata.rejection_reason as string | null) ?? null,
        decided_by: (metadata.decided_by as string | null) ?? null,
        decided_at: (auditDecision as { created_at: string }).created_at,
      }
    : null;

  return NextResponse.json({
    data: {
      members: membersList,
      member_summaries,
      evaluations,
      collated,
      vote_totals,
      dd_decision,
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
  const supabase = createServerClient();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ data: null, error: 'Expected multipart form data' }, { status: 400 });
  }

  const panelMemberId = String(form.get('panel_member_id') ?? '').trim();
  const ddVoteRaw = String(form.get('dd_vote') ?? '').trim();
  const ddVote = isDdVote(ddVoteRaw) ? ddVoteRaw : null;
  const conditions = String(form.get('conditions') ?? '').trim() || null;
  let generalNotes = String(form.get('general_notes') ?? '').trim() || null;
  const uploadedSheet = form.get('sheet');
  if (uploadedSheet instanceof File) {
    const path = `upload:${uploadedSheet.name}`;
    generalNotes = `${generalNotes ?? ''}${generalNotes ? '\n' : ''}[Scoring sheet: ${path}]`;
  }
  const scoresRaw = parseScores(String(form.get('scores') ?? '[]'));

  if (!panelMemberId) {
    return NextResponse.json({ data: null, error: 'panel_member_id is required' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, cfp_id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!app) return NextResponse.json({ data: null, error: 'Application not found' }, { status: 404 });

  const cfpId = (app as { cfp_id: string | null }).cfp_id;
  if (!cfpId) return NextResponse.json({ data: null, error: 'Application has no linked CFP' }, { status: 400 });

  const { data: member } = await supabase
    .from('vc_panel_members')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('cfp_id', cfpId)
    .eq('id', panelMemberId)
    .maybeSingle();
  if (!member) return NextResponse.json({ data: null, error: 'Panel member not found for this CFP' }, { status: 404 });

  const validScores = scoresRaw
    .filter((s) => PANEL_CRITERION_KEYS.has(s.criterion_key))
    .map((s) => ({
      criterion_key: s.criterion_key,
      category: s.category,
      rating: s.rating === 'S' || s.rating === 'R' || s.rating === 'W' || s.rating === 'I' ? s.rating : null,
    }));

  const ratedCount = validScores.filter((s) => s.rating != null).length;
  const status = ratedCount > 0 && ddVote ? 'submitted' : ratedCount > 0 ? 'in_progress' : 'pending';

  const { data: existingEval } = await supabase
    .from('vc_panel_evaluations')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .eq('panel_member_id', panelMemberId)
    .maybeSingle();

  let evaluationId = (existingEval as { id: string } | null)?.id ?? null;
  if (evaluationId) {
    const { error } = await supabase
      .from('vc_panel_evaluations')
      .update({
        status,
        dd_vote: ddVote,
        conditions,
        general_notes: generalNotes,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', evaluationId);
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  } else {
    const { data, error } = await supabase
      .from('vc_panel_evaluations')
      .insert({
        tenant_id: profile.tenant_id,
        application_id: applicationId,
        cfp_id: cfpId,
        panel_member_id: panelMemberId,
        status,
        dd_vote: ddVote,
        conditions,
        general_notes: generalNotes,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    if (error || !data) return NextResponse.json({ data: null, error: error?.message ?? 'Failed to create evaluation' }, { status: 500 });
    evaluationId = (data as { id: string }).id;
  }

  for (const score of validScores) {
    await supabase
      .from('vc_panel_evaluation_scores')
      .upsert(
        {
          tenant_id: profile.tenant_id,
          evaluation_id: evaluationId,
          category: score.category,
          criterion_key: score.criterion_key,
          rating: score.rating,
        },
        { onConflict: 'evaluation_id,criterion_key' },
      );
  }

  const beforeStatus = (app as { status: string }).status;
  if (beforeStatus === 'presentation_complete' || beforeStatus === 'presentation_scheduled' || beforeStatus === 'pre_qualified') {
    await supabase
      .from('vc_fund_applications')
      .update({ status: 'panel_evaluation' })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', applicationId);
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: authUser.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'panel_scores_saved',
    beforeState: { status: beforeStatus },
    afterState: { status: 'panel_evaluation' },
    metadata: { panel_member_id: panelMemberId, rated_count: ratedCount, dd_vote: ddVote },
  });

  return NextResponse.json({ data: { evaluation_id: evaluationId }, error: null });
}
