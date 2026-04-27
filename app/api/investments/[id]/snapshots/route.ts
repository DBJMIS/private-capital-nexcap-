import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { computeSnapshotAlertFlags, scoreFromInputs } from '@/lib/portfolio/flags';
import type { RepaymentStatus } from '@/lib/portfolio/types';
import type { Trend } from '@/lib/portfolio/scoring';
import { scheduleAuditLog } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const TRENDS: Trend[] = ['improving', 'stable', 'declining'];

export async function GET(_req: Request, ctx: Ctx) {
  const { id: investmentId } = await ctx.params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: inv } = await supabase
    .from('vc_investments')
    .select('id')
    .eq('id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rows, error } = await supabase
    .from('vc_portfolio_snapshots')
    .select('*')
    .eq('investment_id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .order('snapshot_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ snapshots: rows ?? [] });
}

type PostBody = {
  snapshot_date: string;
  revenue_usd?: number | null;
  ebitda_usd?: number | null;
  repayment_status: RepaymentStatus;
  revenue_trend: Trend;
  valuation_trend: Trend;
  valuation_usd?: number | null;
  notes?: string | null;
  reviewed_by?: string | null;
};

export async function POST(req: Request, ctx: Ctx) {
  const { id: investmentId } = await ctx.params;
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

  if (!body.snapshot_date || !body.repayment_status) {
    return NextResponse.json({ error: 'snapshot_date and repayment_status required' }, { status: 400 });
  }
  if (!body.revenue_trend || !body.valuation_trend) {
    return NextResponse.json({ error: 'revenue_trend and valuation_trend required' }, { status: 400 });
  }
  if (!TRENDS.includes(body.revenue_trend) || !TRENDS.includes(body.valuation_trend)) {
    return NextResponse.json({ error: 'Invalid trend value' }, { status: 400 });
  }

  const rs: RepaymentStatus[] = ['current', 'delinquent', 'default'];
  if (!rs.includes(body.repayment_status)) {
    return NextResponse.json({ error: 'Invalid repayment_status' }, { status: 400 });
  }

  const { data: inv, error: invErr } = await supabase
    .from('vc_investments')
    .select('id, status')
    .eq('id', investmentId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: 'Investment not found' }, { status: 404 });
  if (inv.status !== 'active') {
    return NextResponse.json({ error: 'Only active investments accept snapshots' }, { status: 400 });
  }

  const performance_score = scoreFromInputs({
    repayment_status: body.repayment_status,
    revenue_trend: body.revenue_trend,
    valuation_trend: body.valuation_trend,
  });

  const alert_flags = computeSnapshotAlertFlags({
    performance_score,
    repayment_status: body.repayment_status,
  });

  const { data: snap, error: insErr } = await supabase
    .from('vc_portfolio_snapshots')
    .insert({
      tenant_id: profile.tenant_id,
      investment_id: investmentId,
      snapshot_date: body.snapshot_date,
      revenue_usd: body.revenue_usd ?? null,
      ebitda_usd: body.ebitda_usd ?? null,
      repayment_status: body.repayment_status,
      revenue_trend: body.revenue_trend,
      valuation_trend: body.valuation_trend,
      performance_score,
      valuation_usd: body.valuation_usd ?? null,
      notes: body.notes ?? null,
      reviewed_by: body.reviewed_by ?? null,
      alert_flags,
    })
    .select('*')
    .single();

  if (insErr || !snap) return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 });

  const { error: upInv } = await supabase
    .from('vc_investments')
    .update({
      portfolio_last_snapshot_date: body.snapshot_date,
      portfolio_latest_score: performance_score,
    })
    .eq('id', investmentId)
    .eq('tenant_id', profile.tenant_id);

  if (upInv) return NextResponse.json({ error: upInv.message }, { status: 500 });

  scheduleAuditLog({
    tenantId: profile.tenant_id,
    actorId: user.id,
    entityType: 'investment',
    entityId: investmentId,
    action: 'portfolio_snapshot_created',
    afterState: { snapshot_id: snap.id, performance_score },
    metadata: { snapshot_table_id: snap.id },
  });

  return NextResponse.json({ snapshot: snap });
}
