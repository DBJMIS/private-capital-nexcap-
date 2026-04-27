import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fundFilter = searchParams.get('fund_id');

  const supabase = createServerClient();
  let builder = supabase.from('vc_compliance_actions').select('*').eq('tenant_id', profile.tenant_id);
  if (fundFilter) {
    builder = builder.eq('fund_id', fundFilter);
  }
  const { data: actions, error } = await builder.order('created_at', { ascending: false }).limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = actions ?? [];
  const obligationIds = [...new Set(list.map((a) => (a as { obligation_id: string }).obligation_id))];
  const fundIds = [...new Set(list.map((a) => (a as { fund_id: string }).fund_id))];

  let obMap = new Map<string, { period_label: string; report_type: string }>();
  if (obligationIds.length > 0) {
    const { data: obs } = await supabase
      .from('vc_reporting_obligations')
      .select('id, period_label, report_type')
      .eq('tenant_id', profile.tenant_id)
      .in('id', obligationIds);
    for (const o of obs ?? []) {
      const row = o as { id: string; period_label: string; report_type: string };
      obMap.set(row.id, { period_label: row.period_label, report_type: row.report_type });
    }
  }

  let fundMap = new Map<string, { fund_name: string; currency: string }>();
  if (fundIds.length > 0) {
    const { data: funds } = await supabase
      .from('vc_portfolio_funds')
      .select('id, fund_name, currency')
      .eq('tenant_id', profile.tenant_id)
      .in('id', fundIds);
    for (const f of funds ?? []) {
      const row = f as { id: string; fund_name: string; currency: string };
      fundMap.set(row.id, { fund_name: row.fund_name, currency: row.currency });
    }
  }

  const enriched = list.map((a) => {
    const act = a as Record<string, unknown>;
    const ob = obMap.get(act.obligation_id as string);
    const fund = fundMap.get(act.fund_id as string);
    return {
      ...act,
      obligation_period_label: ob?.period_label ?? '',
      obligation_report_type: ob?.report_type ?? '',
      fund_name: fund?.fund_name ?? '',
      fund_currency: fund?.currency ?? '',
    };
  });

  return NextResponse.json({ actions: enriched });
}
