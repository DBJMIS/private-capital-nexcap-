import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { recomputeInvestorCapital } from '@/lib/investors/recompute-capital';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: investorId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: inv } = await supabase
    .from('vc_investors')
    .select('id')
    .eq('id', investorId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: 'Investor not found' }, { status: 404 });

  const { data: rows, error } = await supabase
    .from('vc_investor_commitments')
    .select('*')
    .eq('investor_id', investorId)
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ commitments: rows ?? [] });
}

type PostBody = {
  application_id?: string | null;
  investment_id?: string | null;
  committed_amount_usd: number;
  deployed_amount_usd?: number;
  confirmed?: boolean;
  commitment_date?: string | null;
  notes?: string | null;
};

export async function POST(req: Request, ctx: Ctx) {
  const { id: investorId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const amt = Number(body.committed_amount_usd);
  if (!Number.isFinite(amt) || amt < 0) {
    return NextResponse.json({ error: 'committed_amount_usd must be a non-negative number' }, { status: 400 });
  }

  const appId = body.application_id?.trim() || null;
  const invId = body.investment_id?.trim() || null;
  if (!appId && !invId) {
    return NextResponse.json(
      { error: 'Either application_id or investment_id is required (link to a fund or investment)' },
      { status: 400 },
    );
  }

  const dep = Number(body.deployed_amount_usd ?? 0);
  if (!Number.isFinite(dep) || dep < 0 || dep > amt) {
    return NextResponse.json({ error: 'deployed_amount_usd must be between 0 and committed_amount_usd' }, { status: 400 });
  }

  const { data: investor } = await supabase
    .from('vc_investors')
    .select('id')
    .eq('id', investorId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 });

  if (appId) {
    const { data: app } = await supabase
      .from('vc_fund_applications')
      .select('id')
      .eq('id', appId)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle();
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (invId) {
    const { data: inv } = await supabase
      .from('vc_investments')
      .select('id')
      .eq('id', invId)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle();
    if (!inv) return NextResponse.json({ error: 'Investment not found' }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from('vc_investor_commitments')
    .insert({
      tenant_id: profile.tenant_id,
      investor_id: investorId,
      application_id: appId,
      investment_id: invId,
      committed_amount_usd: amt,
      deployed_amount_usd: dep,
      confirmed: body.confirmed ?? false,
      commitment_date: body.commitment_date ?? null,
      notes: body.notes?.trim() || null,
    })
    .select('*')
    .single();

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  await recomputeInvestorCapital(supabase, profile.tenant_id, investorId);

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'investor',
    entityId: investorId,
    action: 'commitment_added',
    afterState: { commitment_id: row.id, committed_amount_usd: amt },
    metadata: { commitment_row_id: row.id },
  });

  return NextResponse.json({ commitment: row });
}
