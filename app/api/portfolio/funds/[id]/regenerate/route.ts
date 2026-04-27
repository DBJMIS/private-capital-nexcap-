import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { generateReportingObligations, refreshObligationStatuses } from '@/lib/portfolio/reporting-engine';
import type { PortfolioFundRow } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = createServerClient();

  const { data: fund, error } = await supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();

  if (error || !fund) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }

  const { inserted } = await generateReportingObligations(supabase, fund as PortfolioFundRow);
  await refreshObligationStatuses(supabase, profile.tenant_id);

  const { count } = await supabase
    .from('vc_reporting_obligations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', id);

  return NextResponse.json({
    upsert_batch_size: inserted,
    obligation_count: count ?? 0,
  });
}
