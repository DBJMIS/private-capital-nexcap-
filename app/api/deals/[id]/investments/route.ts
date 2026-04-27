import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { hasIcApprovalForDeal } from '@/lib/deals/transitions';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type InstrumentType = 'equity' | 'debt' | 'convertible' | 'mezzanine' | 'grant' | 'blended';

export async function GET(_req: Request, ctx: Ctx) {
  const { id: dealId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: deal } = await supabase
    .from('vc_deals')
    .select('id')
    .eq('id', dealId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  const { data: rows, error } = await supabase
    .from('vc_investments')
    .select('*')
    .eq('deal_id', dealId)
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ investments: rows ?? [] });
}

type PostBody = {
  approved_amount_usd: number;
  instrument_type: InstrumentType;
  investment_date?: string | null;
  maturity_date?: string | null;
};

export async function POST(req: Request, ctx: Ctx) {
  const { id: dealId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !can(profile, 'write:investments')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const amt = Number(body.approved_amount_usd);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'approved_amount_usd must be positive' }, { status: 400 });
  }

  if (!body.instrument_type) {
    return NextResponse.json({ error: 'instrument_type required' }, { status: 400 });
  }

  const { data: deal, error: dErr } = await supabase
    .from('vc_deals')
    .select('id, application_id, stage')
    .eq('id', dealId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (dErr || !deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  if (!['investment_committee', 'approved'].includes(deal.stage)) {
    return NextResponse.json(
      { error: 'Investment can only be created when deal is at investment_committee or approved' },
      { status: 400 },
    );
  }

  const ic = await hasIcApprovalForDeal(supabase, profile.tenant_id, dealId);
  if (!ic) {
    return NextResponse.json(
      { error: 'Investment Committee approval is required before creating an investment' },
      { status: 400 },
    );
  }

  const { data: active } = await supabase
    .from('vc_investments')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('deal_id', dealId)
    .eq('status', 'active')
    .maybeSingle();

  if (active?.id) {
    return NextResponse.json({ error: 'An active investment already exists for this deal' }, { status: 409 });
  }

  const { data: row, error: insErr } = await supabase
    .from('vc_investments')
    .insert({
      tenant_id: profile.tenant_id,
      deal_id: dealId,
      application_id: deal.application_id,
      approved_amount_usd: amt,
      disbursed_amount_usd: 0,
      status: 'active',
      instrument_type: body.instrument_type,
      investment_date: body.investment_date ?? null,
      maturity_date: body.maturity_date ?? null,
      created_by: user.id,
    })
    .select('id, status')
    .single();

  if (insErr || !row) return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'investment',
    entityId: row.id,
    action: 'created',
    afterState: { deal_id: dealId, approved_amount_usd: amt, status: row.status },
  });

  return NextResponse.json({ investment_id: row.id });
}
