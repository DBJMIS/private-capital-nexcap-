import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type Body = { action: 'approve' | 'reject'; rejection_reason?: string | null };

export async function POST(req: Request, ctx: Ctx) {
  const authUser = await requireAuth();
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

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const appRow = app as { id: string; status: string };
  const st = appRow.status.trim().toLowerCase();
  if (st === 'committed' || st === 'approved' || st === 'rejected') {
    return NextResponse.json({ error: 'Application already finalized' }, { status: 400 });
  }

  if (body.action === 'reject') {
    const reason = String(body.rejection_reason ?? '').trim();
    if (!reason) {
      return NextResponse.json({ error: 'rejection_reason is required' }, { status: 400 });
    }

    const { error: upErr } = await supabase
      .from('vc_fund_applications')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', applicationId);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: authUser.id,
      entityType: 'fund_application',
      entityId: applicationId,
      action: 'final_reject',
      afterState: { status: 'rejected' },
    });

    return NextResponse.json({ ok: true });
  }

  const { data: assessment } = await supabase
    .from('vc_assessments')
    .select('id, status, passed')
    .eq('tenant_id', profile.tenant_id)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ar = assessment as { id: string; status: string; passed: boolean | null } | null;
  if (!ar || ar.status !== 'completed' || ar.passed !== true) {
    return NextResponse.json(
      { error: 'A completed assessment with a passing score is required before approval.' },
      { status: 400 },
    );
  }

  const { error: upErr } = await supabase
    .from('vc_fund_applications')
    .update({ status: 'committed' })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: authUser.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'final_approve',
    afterState: { status: 'committed' },
  });

  return NextResponse.json({ ok: true });
}
