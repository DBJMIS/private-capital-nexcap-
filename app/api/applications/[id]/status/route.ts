import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog, clientIpFromRequest } from '@/lib/audit/log';
import { validateApplicationStatusTransition } from '@/lib/applications/status-transitions';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  status: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const nextStatus = String(body.status ?? '').trim();
  if (!nextStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 });

  const supabase = createServerClient();
  const { data: app, error: appErr } = await supabase
    .from('vc_fund_applications')
    .select('id, status, pipeline_metadata')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const row = app as { id: string; status: string; pipeline_metadata: unknown };
  const v = validateApplicationStatusTransition({
    fromStatus: row.status,
    toStatus: nextStatus,
    reason: body.reason,
  });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const prevMeta =
    row.pipeline_metadata && typeof row.pipeline_metadata === 'object' ? (row.pipeline_metadata as Record<string, unknown>) : {};
  const pipeline_metadata = {
    ...prevMeta,
    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
  };

  const patch: Record<string, unknown> = {
    status: nextStatus,
    pipeline_metadata,
  };
  if (nextStatus === 'rejected') {
    patch.rejection_reason = String(body.reason ?? '').trim();
  }

  const { error: upErr } = await supabase
    .from('vc_fund_applications')
    .update(patch)
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'status_change',
    beforeState: { status: row.status },
    afterState: { status: nextStatus },
    metadata: { reason: body.reason ?? null },
    ipAddress: clientIpFromRequest(req),
  });

  const { data: updated } = await supabase
    .from('vc_fund_applications')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .maybeSingle();

  return NextResponse.json({ application: updated });
}
