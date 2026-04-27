import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Records IC approval for a deal (required before deal stage → approved).
 * Approver-only.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id: dealId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'approve:investment')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { decision_notes?: string };
  try {
    body = (await req.json()) as { decision_notes?: string };
  } catch {
    body = {};
  }

  const notes = (body.decision_notes ?? '').trim();
  if (!notes) {
    return NextResponse.json({ error: 'decision_notes is required' }, { status: 400 });
  }

  const { data: deal } = await supabase
    .from('vc_deals')
    .select('id, stage')
    .eq('id', dealId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  const { data: existing } = await supabase
    .from('vc_approvals')
    .select('id, status')
    .eq('tenant_id', profile.tenant_id)
    .eq('entity_type', 'deal')
    .eq('entity_id', dealId)
    .eq('approval_type', 'investment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing?.id) {
    const { error } = await supabase
      .from('vc_approvals')
      .update({
        status: 'approved',
        approved_by: user.id,
        decided_at: now,
        decision_notes: notes,
      })
      .eq('id', existing.id)
      .eq('tenant_id', profile.tenant_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from('vc_approvals').insert({
      tenant_id: profile.tenant_id,
      entity_type: 'deal',
      entity_id: dealId,
      approval_type: 'investment',
      requested_by: user.id,
      approved_by: user.id,
      status: 'approved',
      decided_at: now,
      decision_notes: notes,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'deal',
    entityId: dealId,
    action: 'ic_recorded',
    afterState: { stage: deal.stage },
    metadata: { source: 'ic_approval' },
  });

  return NextResponse.json({ ok: true });
}
