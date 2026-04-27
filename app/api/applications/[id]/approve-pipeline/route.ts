import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  ensureDealForApprovedApplication,
  validatePipelinePrerequisites,
} from '@/lib/deals/from-application';
import {
  hasApprovedDueDiligenceCompletion,
  hasApprovedPreScreening,
} from '@/lib/workflow/approval-rules';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Approver action: mark application approved (DD complete + assessment passed)
 * and auto-create the pipeline deal.
 */
export async function POST(_req: Request, ctx: Ctx) {
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

  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, status')
    .eq('id', applicationId)
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const pre = await validatePipelinePrerequisites(supabase, profile.tenant_id, applicationId);
  if (!pre.ok) {
    return NextResponse.json({ error: pre.error }, { status: 400 });
  }

  const preScreen = await hasApprovedPreScreening(supabase, profile.tenant_id, applicationId);
  if (!preScreen) {
    return NextResponse.json(
      { error: 'Pre-screening officer approval is required before pipeline approval' },
      { status: 400 },
    );
  }

  const ddApproval = await hasApprovedDueDiligenceCompletion(supabase, profile.tenant_id, applicationId);
  if (!ddApproval) {
    return NextResponse.json(
      { error: 'Due diligence completion approval is required before pipeline approval' },
      { status: 400 },
    );
  }

  if (app.status === 'approved') {
    const dealRes = await ensureDealForApprovedApplication({
      supabase,
      tenantId: profile.tenant_id,
      applicationId: app.id,
      actorUserId: user.id,
      fundTitle: app.fund_name,
    });
    if (!dealRes.ok) return NextResponse.json({ error: dealRes.error }, { status: 400 });
    return NextResponse.json({ application_id: app.id, deal_id: dealRes.deal_id, created: dealRes.created });
  }

  if (app.status !== 'due_diligence') {
    return NextResponse.json(
      { error: 'Application must be in due diligence to approve for pipeline' },
      { status: 400 },
    );
  }

  const { error: rpcErr } = await supabase.rpc('vc_app_approve_for_pipeline', {
    p_application_id: applicationId,
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? '';
    if (msg.includes('invalid_status')) {
      return NextResponse.json({ error: 'Application could not be promoted (check status)' }, { status: 400 });
    }
    if (msg.includes('forbidden')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const dealRes = await ensureDealForApprovedApplication({
    supabase,
    tenantId: profile.tenant_id,
    applicationId: app.id,
    actorUserId: user.id,
    fundTitle: app.fund_name,
  });

  if (!dealRes.ok) {
    return NextResponse.json(
      {
        error: dealRes.error,
        hint: 'Application may be approved without a deal; an admin can create the deal from POST /api/deals when prerequisites are met.',
      },
      { status: 400 },
    );
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'status_changed',
    beforeState: { status: app.status },
    afterState: { status: 'approved', deal_id: dealRes.deal_id, deal_created: dealRes.created },
    metadata: { source: 'approve_pipeline' },
  });

  return NextResponse.json({
    application_id: app.id,
    deal_id: dealRes.deal_id,
    deal_created: dealRes.created,
  });
}
