import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { ensurePreScreeningChecklist } from '@/lib/pre-screening/ensure-checklist';
import type { PreScreeningItemRow } from '@/lib/pre-screening/evaluate';
import {
  evaluatePreScreening,
  allItemsAnswered,
} from '@/lib/pre-screening/evaluate';
import { syncChecklistCategoryFlags } from '@/lib/pre-screening/sync-checklist';
import { notifyPreScreeningResult } from '@/lib/pre-screening/notify';
import { notifyApprovalRequestCreated } from '@/lib/workflow/notify-stub';
import { scheduleAuditLog } from '@/lib/audit/log';
import { effectiveMinFundSizeUsd } from '@/lib/cfp/effective-criteria';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

function mapItems(rows: { id: string; category: string; item_key: string; label: string; status: string; notes: string | null }[]): PreScreeningItemRow[] {
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    item_key: r.item_key,
    label: r.label,
    status: r.status as PreScreeningItemRow['status'],
    notes: r.notes,
  }));
}

export async function POST(_req: Request, ctx: RouteCtx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, tenant_id, status, fund_name, created_by, total_capital_commitment_usd, cfp_id')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (app.status === 'draft') {
    return NextResponse.json({ error: 'Application not in pre-screening flow' }, { status: 400 });
  }
  if (['due_diligence', 'approved', 'rejected'].includes(app.status)) {
    return NextResponse.json(
      { error: 'Application has already left the pre-screening stage' },
      { status: 400 },
    );
  }

  const ensured = await ensurePreScreeningChecklist(supabase, profile.tenant_id, applicationId);
  if ('error' in ensured) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  const itemRows = mapItems(ensured.items);
  if (!allItemsAnswered(itemRows)) {
    return NextResponse.json(
      { error: 'All checklist items must be answered (Y/N) before completion' },
      { status: 400 },
    );
  }

  const appRow = app as { total_capital_commitment_usd: number | null; cfp_id: string | null };
  let minFundUsd = effectiveMinFundSizeUsd(null);
  if (appRow.cfp_id) {
    const { data: cfpRow } = await supabase
      .from('vc_cfps')
      .select('investment_criteria')
      .eq('tenant_id', profile.tenant_id)
      .eq('id', appRow.cfp_id)
      .maybeSingle();
    if (cfpRow) {
      minFundUsd = effectiveMinFundSizeUsd((cfpRow as { investment_criteria: unknown }).investment_criteria);
    }
  }
  const commitment = Number(appRow.total_capital_commitment_usd ?? 0);
  if (!Number.isFinite(commitment) || commitment < minFundUsd) {
    return NextResponse.json(
      {
        error: `Total capital commitment must be at least USD ${minFundUsd.toLocaleString('en-US')} per linked CFP criteria (or DBJ defaults if no CFP).`,
      },
      { status: 400 },
    );
  }

  const outcome = evaluatePreScreening(itemRows);
  if (outcome === 'incomplete') {
    return NextResponse.json({ error: 'Checklist incomplete' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const flaggedForReview = outcome === 'legal_review_required';
  const passed = outcome === 'passed';

  await syncChecklistCategoryFlags(supabase, profile.tenant_id, ensured.checklist.id, itemRows);

  const { error: chkErr } = await supabase
    .from('vc_pre_screening_checklists')
    .update({
      overall_pass: passed,
      flagged_for_review: flaggedForReview,
      reviewed_by: user.id,
      reviewed_at: now,
    })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', ensured.checklist.id);

  if (chkErr) {
    return NextResponse.json({ error: chkErr.message }, { status: 500 });
  }

  let ddQuestionnaireId: string | null = null;
  let preScreeningApprovalId: string | null = null;

  if (passed || flaggedForReview) {
    const assignedRaw = process.env.PRE_SCREENING_APPROVER_USER_ID?.trim();
    const assigned_to =
      assignedRaw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignedRaw)
        ? assignedRaw
        : null;

    const { data: appr, error: apErr } = await supabase
      .from('vc_approvals')
      .insert({
        tenant_id: profile.tenant_id,
        entity_type: 'application',
        entity_id: applicationId,
        approval_type: 'pre_screening',
        requested_by: user.id,
        assigned_to,
        status: 'pending',
      })
      .select('id')
      .single();

    if (apErr || !appr) {
      if (apErr?.message?.includes('duplicate') || apErr?.code === '23505') {
        return NextResponse.json({ error: 'A pre-screening approval request already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: apErr?.message ?? 'Failed to create approval request' }, { status: 500 });
    }

    preScreeningApprovalId = appr.id;

    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: user.id,
      entityType: 'approval',
      entityId: appr.id,
      action: 'requested',
      afterState: {
        status: 'pending',
        approval_type: 'pre_screening',
        target_entity_type: 'application',
        target_entity_id: applicationId,
      },
      metadata: { application_id: applicationId, source: 'pre_screening_complete' },
    });

    await notifyApprovalRequestCreated({
      tenantId: profile.tenant_id,
      approvalId: appr.id,
      approvalType: 'pre_screening',
    });

    const { error: appUpdErr } = await supabase
      .from('vc_fund_applications')
      .update({ status: 'pre_screening' })
      .eq('id', applicationId)
      .eq('tenant_id', profile.tenant_id);

    if (appUpdErr) {
      return NextResponse.json({ error: appUpdErr.message }, { status: 500 });
    }
  } else {
    const { error: appUpdErr } = await supabase
      .from('vc_fund_applications')
      .update({ status: 'pre_screening' })
      .eq('id', applicationId)
      .eq('tenant_id', profile.tenant_id);

    if (appUpdErr) {
      return NextResponse.json({ error: appUpdErr.message }, { status: 500 });
    }
  }

  const { data: ddQuestionnaireRow } = await supabase
    .from('vc_dd_questionnaires')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .maybeSingle();
  if (ddQuestionnaireRow?.id) {
    ddQuestionnaireId = ddQuestionnaireRow.id as string;
  } else {
    // TODO: vc_dd_questionnaires row is usually created when an officer approves pre_screening
    // (applyApprovalSideEffects); id stays null in this response until then (e.g. my-application bootstrap may already have a row).
    ddQuestionnaireId = null;
  }

  const preScreenAction =
    outcome === 'passed' ? 'passed' : outcome === 'failed' ? 'failed' : 'completed';

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'pre_screening',
    entityId: ensured.checklist.id,
    action: preScreenAction,
    beforeState: { reviewed_at: null, overall_pass: null },
    afterState: {
      overall_pass: passed,
      flagged_for_review: flaggedForReview,
      reviewed_at: now,
      outcome,
    },
    metadata: {
      application_id: applicationId,
      pre_screening_approval_id: preScreeningApprovalId,
      dd_questionnaire_id: ddQuestionnaireId,
    },
  });

  const { data: managerProfile } = await supabase
    .from('vc_profiles')
    .select('email')
    .eq('tenant_id', profile.tenant_id)
    .eq('user_id', app.created_by)
    .maybeSingle();

  const fundManagerEmail =
    (managerProfile as { email?: string } | null)?.email?.trim() || profile.email;
  const officerEmail = process.env.PRE_SCREENING_OFFICER_EMAIL?.trim() || null;

  const summaryLines = [
    `Fund: ${app.fund_name}`,
    `Application: ${applicationId}`,
    `Outcome: ${outcome}`,
    passed || flaggedForReview
      ? 'Officer approval is required before advancing to Due Diligence.'
      : 'Application remains in Pre-Screening.',
    flaggedForReview ? 'Legal & Regulatory item(s) marked No — flagged for officer review.' : '',
  ].filter(Boolean);

  await notifyPreScreeningResult({
    fundManagerEmail,
    applicationId,
    fundName: app.fund_name,
    outcome: outcome === 'passed' ? 'passed' : outcome === 'legal_review_required' ? 'legal_review_required' : 'failed',
    summary: summaryLines.join('\n'),
    officerEmail,
  });

  return NextResponse.json({
    outcome,
    application_status: 'pre_screening',
    dd_questionnaire_id: ddQuestionnaireId,
    flagged_for_review: flaggedForReview,
    pre_screening_approval_id: preScreeningApprovalId,
  });
}
