import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  decision: 'shortlisted' | 'not_shortlisted';
  notes: string;
  rejection_reason?: string | null;
};

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

  if (body.decision !== 'shortlisted' && body.decision !== 'not_shortlisted') {
    return NextResponse.json({ error: 'decision must be shortlisted or not_shortlisted' }, { status: 400 });
  }

  const notes = String(body.notes ?? '').trim();
  const decidedAt = new Date().toISOString();

  const supabase = createServerClient();

  const { data: app } = await supabase
    .from('vc_fund_applications')
    .select('id, status, pipeline_metadata')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const row = app as { id: string; status: string; pipeline_metadata: unknown };
  const st = row.status.trim().toLowerCase();
  if (st !== 'pre_qualified') {
    return NextResponse.json({ error: 'Application must be in pre_qualified status to shortlist' }, { status: 400 });
  }

  if (body.decision === 'not_shortlisted') {
    const reason = String(body.rejection_reason ?? '').trim();
    if (!reason) {
      return NextResponse.json({ error: 'rejection_reason is required when not shortlisted' }, { status: 400 });
    }

    const prevMeta = (row.pipeline_metadata && typeof row.pipeline_metadata === 'object' ? row.pipeline_metadata : {}) as Record<
      string,
      unknown
    >;
    const pipeline_metadata = {
      ...prevMeta,
      shortlisting: { decision: 'not_shortlisted', notes, decided_at: decidedAt },
    };

    const { error: upErr } = await supabase
      .from('vc_fund_applications')
      .update({ status: 'rejected', rejection_reason: reason, pipeline_metadata })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', applicationId);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    scheduleAuditLog({
      tenantId: profile.tenant_id,
      actorId: authUser.id,
      entityType: 'fund_application',
      entityId: applicationId,
      action: 'shortlist_reject',
      afterState: { status: 'rejected' },
    });

    return NextResponse.json({ ok: true });
  }

  const prevMeta = (row.pipeline_metadata && typeof row.pipeline_metadata === 'object' ? row.pipeline_metadata : {}) as Record<
    string,
    unknown
  >;
  const pipeline_metadata = {
    ...prevMeta,
    shortlisting: { decision: 'shortlisted', notes, decided_at: decidedAt },
  };

  const { error: upErr } = await supabase
    .from('vc_fund_applications')
    .update({ status: 'shortlisted', pipeline_metadata })
    .eq('tenant_id', profile.tenant_id)
    .eq('id', applicationId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: authUser.id,
    entityType: 'fund_application',
    entityId: applicationId,
    action: 'shortlist_approve',
    afterState: { status: 'shortlisted' },
  });

  return NextResponse.json({ ok: true });
}
