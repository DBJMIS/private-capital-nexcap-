import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: deal, error } = await supabase
    .from('vc_deals')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (error || !deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: application } = await supabase
    .from('vc_fund_applications')
    .select('*')
    .eq('id', deal.application_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  let assessment = null;
  if (deal.assessment_id) {
    const { data: asst } = await supabase
      .from('vc_assessments')
      .select('id, status, overall_score, passed, completed_at, recommendation')
      .eq('id', deal.assessment_id)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle();
    assessment = asst;
  }

  const { data: notes } = await supabase
    .from('vc_deal_notes')
    .select('id, body, author_id, created_at')
    .eq('deal_id', id)
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false });

  const authorIds = [...new Set((notes ?? []).map((n) => n.author_id))];
  const authors: Record<string, string> = {};
  if (authorIds.length) {
    const { data: profs } = await supabase
      .from('vc_profiles')
      .select('user_id, full_name')
      .eq('tenant_id', profile.tenant_id)
      .in('user_id', authorIds);
    for (const p of profs ?? []) authors[p.user_id] = p.full_name;
  }

  const { data: investments } = await supabase
    .from('vc_investments')
    .select('*')
    .eq('deal_id', id)
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false });

  const { data: icApprovals } = await supabase
    .from('vc_approvals')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('entity_type', 'deal')
    .eq('entity_id', id)
    .eq('approval_type', 'investment')
    .order('created_at', { ascending: false });

  return NextResponse.json({
    deal,
    application,
    assessment,
    notes: (notes ?? []).map((n) => ({
      ...n,
      author_name: authors[n.author_id] ?? '—',
    })),
    investments: investments ?? [],
    ic_approvals: icApprovals ?? [],
  });
}

type PatchBody = {
  assigned_officer?: string | null;
  title?: string;
  deal_value_usd?: number | null;
  sector?: string | null;
  geography?: string | null;
  notes?: string | null;
};

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:deals')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.assigned_officer !== undefined) patch.assigned_officer = body.assigned_officer;
  if (body.title !== undefined) patch.title = body.title;
  if (body.deal_value_usd !== undefined) patch.deal_value_usd = body.deal_value_usd;
  if (body.sector !== undefined) patch.sector = body.sector;
  if (body.geography !== undefined) patch.geography = body.geography;
  if (body.notes !== undefined) patch.notes = body.notes;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: prior } = await supabase
    .from('vc_deals')
    .select('assigned_officer, title, deal_value_usd, sector, geography, notes')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  const { data: deal, error } = await supabase
    .from('vc_deals')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const onlyOfficer =
    Object.keys(patch).length === 1 && patch.assigned_officer !== undefined;
  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'deal',
    entityId: id,
    action: onlyOfficer ? 'assigned' : 'updated',
    beforeState: (prior ?? undefined) as Record<string, unknown> | undefined,
    afterState: patch,
  });

  return NextResponse.json({ ok: true });
}
