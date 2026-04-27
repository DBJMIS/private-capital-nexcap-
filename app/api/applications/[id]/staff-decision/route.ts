import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ensureDealForApprovedApplication } from '@/lib/deals/from-application';
import { scheduleAuditLog } from '@/lib/audit/log';
import { notifyFundManagerEvaluation } from '@/lib/workflow/notify-stub';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type Body = { decision: 'accept' | 'reject'; notes: string };

export async function POST(req: Request, ctx: Ctx) {
  const { id: applicationId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'approve:due_diligence')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.decision !== 'accept' && body.decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be accept or reject' }, { status: 400 });
  }
  if (typeof body.notes !== 'string') {
    return NextResponse.json({ error: 'notes required' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, status')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('id, overall_score, passed')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (body.decision === 'accept') {
    const score = assessment?.overall_score != null ? Number(assessment.overall_score) : null;
    if (score == null || score < 70 || assessment?.passed !== true) {
      return NextResponse.json(
        { error: 'Accept requires overall score ≥ 70 and a passing assessment record' },
        { status: 400 },
      );
    }

    const { error: uApp } = await supabase
      .from('vc_fund_applications')
      .update({ status: 'approved' })
      .eq('id', applicationId)
      .eq('tenant_id', profile.tenant_id);

    if (uApp) return NextResponse.json({ error: uApp.message }, { status: 500 });

    if (assessment?.id) {
      await supabase
        .from('vc_assessments')
        .update({ recommendation: 'approve', approved_by: user.id })
        .eq('id', assessment.id)
        .eq('tenant_id', profile.tenant_id);
    }

    const deal = await ensureDealForApprovedApplication({
      supabase,
      tenantId: profile.tenant_id,
      applicationId,
      actorUserId: user.id,
      fundTitle: app.fund_name,
    });

    if (!deal.ok) {
      return NextResponse.json({ error: deal.error }, { status: 400 });
    }

    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: user.id,
      entityType: 'fund_application',
      entityId: applicationId,
      action: 'staff_accepted',
      afterState: { status: 'approved', deal_id: deal.deal_id },
      metadata: { notes: body.notes },
    });

    await notifyFundManagerEvaluation({
      tenantId: profile.tenant_id,
      applicationId,
      kind: 'accepted',
      message: body.notes,
    });

    return NextResponse.json({ ok: true, deal_id: deal.deal_id });
  }

  const { error: rj } = await supabase
    .from('vc_fund_applications')
    .update({ status: 'rejected', rejection_reason: body.notes.trim() })
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id);

  if (rj) return NextResponse.json({ error: rj.message }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'staff_rejected',
    afterState: { status: 'rejected' },
    metadata: { notes: body.notes },
  });

  await notifyFundManagerEvaluation({
    tenantId: profile.tenant_id,
    applicationId,
    kind: 'rejected',
    message: body.notes,
  });

  return NextResponse.json({ ok: true });
}
