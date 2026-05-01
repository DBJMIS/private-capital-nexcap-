import { NextResponse } from 'next/server';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { DIVESTMENT_SELECT, type DivestmentRow, summarizeDivestments } from '@/lib/portfolio/divestments';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fundId } = await ctx.params;
  const supabase = createServerClient();

  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id, fund_name')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!fund) return NextResponse.json({ error: 'Fund not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('vc_divestments')
    .select(DIVESTMENT_SELECT)
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', fundId)
    .order('completion_date', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const divestments = (data ?? []) as DivestmentRow[];
  const fundById = new Map([[fundId, { fund_name: String((fund as { fund_name: string }).fund_name) }]]);
  return NextResponse.json({
    divestments,
    summary: summarizeDivestments(divestments, fundById),
  });
}
