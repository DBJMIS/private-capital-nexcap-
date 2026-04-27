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

  const { data: inv, error } = await supabase
    .from('vc_investments')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (error || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: deal } = await supabase
    .from('vc_deals')
    .select('id, title, stage, application_id')
    .eq('id', inv.deal_id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  const { data: application } = deal
    ? await supabase
        .from('vc_fund_applications')
        .select('id, fund_name, manager_name, status')
        .eq('id', deal.application_id)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle()
    : { data: null };

  return NextResponse.json({ investment: inv, deal, application });
}

type PatchBody = {
  portfolio_reviewer_id?: string | null;
};

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:investments')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!('portfolio_reviewer_id' in body)) {
    return NextResponse.json({ error: 'No updatable fields' }, { status: 400 });
  }

  const reviewer = body.portfolio_reviewer_id;
  if (reviewer !== null && reviewer !== undefined) {
    if (typeof reviewer !== 'string' || reviewer.length < 10) {
      return NextResponse.json({ error: 'portfolio_reviewer_id must be a valid UUID or null' }, { status: 400 });
    }
  }

  const { data: inv, error: fetchErr } = await supabase
    .from('vc_investments')
    .select('id, portfolio_reviewer_id, status')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (fetchErr || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: updated, error: upErr } = await supabase
    .from('vc_investments')
    .update({ portfolio_reviewer_id: reviewer ?? null })
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select('*')
    .maybeSingle();

  if (upErr || !updated) return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'investment',
    entityId: id,
    action: 'updated',
    beforeState: { portfolio_reviewer_id: inv.portfolio_reviewer_id, status: inv.status },
    afterState: { portfolio_reviewer_id: updated.portfolio_reviewer_id, status: updated.status },
  });

  return NextResponse.json({ investment: updated });
}
