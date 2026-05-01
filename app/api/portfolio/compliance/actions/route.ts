import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

const ACTION_SELECT =
  'id, tenant_id, obligation_id, fund_id, action_type, actor_id, actor_name, from_status, to_status, notes, recipient, created_at';

export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fundFilter = searchParams.get('fund_id');

  const PAGE_SIZE = Math.min(parseInt(searchParams.get('page_size') ?? '50', 10) || 50, 100);
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createServerClient();
  let builder = supabase
    .from('vc_compliance_actions')
    .select(ACTION_SELECT, { count: 'exact' })
    .eq('tenant_id', profile.tenant_id);
  if (fundFilter) {
    builder = builder.eq('fund_id', fundFilter);
  }
  const { data: actions, error, count } = await builder.order('created_at', { ascending: false }).range(from, to);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = actions ?? [];
  const obligationIds = [...new Set(list.map((a) => (a as { obligation_id: string }).obligation_id))];
  const fundIds = [...new Set(list.map((a) => (a as { fund_id: string }).fund_id))];

  const [obsRes, fundsRes] = await Promise.all([
    obligationIds.length > 0
      ? supabase
          .from('vc_reporting_obligations')
          .select('id, period_label, report_type')
          .eq('tenant_id', profile.tenant_id)
          .in('id', obligationIds)
      : Promise.resolve({ data: [] as { id: string; period_label: string; report_type: string }[] }),
    fundIds.length > 0
      ? supabase
          .from('vc_portfolio_funds')
          .select('id, fund_name, currency')
          .eq('tenant_id', profile.tenant_id)
          .in('id', fundIds)
      : Promise.resolve({ data: [] as { id: string; fund_name: string; currency: string }[] }),
  ]);

  const obMap = new Map<string, { period_label: string; report_type: string }>();
  for (const o of obsRes.data ?? []) {
    const row = o as { id: string; period_label: string; report_type: string };
    obMap.set(row.id, { period_label: row.period_label, report_type: row.report_type });
  }

  const fundMap = new Map<string, { fund_name: string; currency: string }>();
  for (const f of fundsRes.data ?? []) {
    const row = f as { id: string; fund_name: string; currency: string };
    fundMap.set(row.id, { fund_name: row.fund_name, currency: row.currency });
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

  const total = count ?? 0;
  return NextResponse.json({
    actions: enriched,
    pagination: {
      page,
      page_size: PAGE_SIZE,
      total,
      total_pages: Math.ceil(total / PAGE_SIZE),
    },
  });
}
