import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { utilizationPercent } from '@/lib/investors/recompute-capital';

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
    .select('id, name, committed_capital_usd, deployed_capital_usd')
    .eq('id', investorId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: 'Investor not found' }, { status: 404 });

  const { data: commitments } = await supabase
    .from('vc_investor_commitments')
    .select('id, application_id, investment_id, committed_amount_usd, deployed_amount_usd, commitment_date, confirmed')
    .eq('investor_id', investorId)
    .eq('tenant_id', profile.tenant_id);

  const list = commitments ?? [];
  const appIds = [...new Set(list.map((c) => c.application_id).filter(Boolean))] as string[];
  const invIds = [...new Set(list.map((c) => c.investment_id).filter(Boolean))] as string[];

  const appMap = new Map<string, string>();
  if (appIds.length) {
    const { data: apps } = await supabase
      .from('vc_fund_applications')
      .select('id, fund_name')
      .eq('tenant_id', profile.tenant_id)
      .in('id', appIds);
    for (const a of apps ?? []) appMap.set(a.id, (a as { fund_name: string }).fund_name);
  }

  const invMap = new Map<string, { disbursed: number; application_id: string | null }>();
  if (invIds.length) {
    const { data: invs } = await supabase
      .from('vc_investments')
      .select('id, disbursed_amount_usd, application_id')
      .eq('tenant_id', profile.tenant_id)
      .in('id', invIds);
    for (const i of invs ?? []) {
      invMap.set(i.id, {
        disbursed: Number((i as { disbursed_amount_usd: number }).disbursed_amount_usd),
        application_id: (i as { application_id: string | null }).application_id,
      });
    }
  }

  const extraAppIds = [...new Set([...invMap.values()].map((v) => v.application_id).filter(Boolean))] as string[];
  for (const aid of extraAppIds) {
    if (!appMap.has(aid)) {
      const { data: app } = await supabase
        .from('vc_fund_applications')
        .select('id, fund_name')
        .eq('id', aid)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle();
      if (app) appMap.set(aid, (app as { fund_name: string }).fund_name);
    }
  }

  const lines = list.map((c) => {
    const committed = Number(c.committed_amount_usd);
    const deployed = Number((c as { deployed_amount_usd?: number }).deployed_amount_usd ?? 0);
    let fundName: string | null = null;
    if (c.application_id) fundName = appMap.get(c.application_id) ?? null;
    let disbursed: number | null = null;
    if (c.investment_id) {
      const meta = invMap.get(c.investment_id);
      if (meta) {
        disbursed = meta.disbursed;
        if (!fundName && meta.application_id) fundName = appMap.get(meta.application_id) ?? null;
      }
    }
    return {
      commitment_id: c.id,
      application_id: c.application_id,
      investment_id: c.investment_id,
      fund_name: fundName,
      committed_amount_usd: committed,
      deployed_amount_usd: deployed,
      investment_disbursed_usd: disbursed,
      commitment_date: c.commitment_date,
      confirmed: c.confirmed,
    };
  });

  const aggC = Number(inv.committed_capital_usd);
  const aggD = Number(inv.deployed_capital_usd);

  return NextResponse.json({
    investor: { id: inv.id, name: inv.name },
    lines,
    summary: {
      total_committed_usd: aggC,
      total_deployed_usd: aggD,
      utilization_percent: utilizationPercent(aggC, aggD),
      line_count: lines.length,
    },
  });
}
