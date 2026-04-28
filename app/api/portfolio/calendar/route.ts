import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { refreshObligationStatuses } from '@/lib/portfolio/reporting-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from_date');
  const to = url.searchParams.get('to_date');
  const fundId = url.searchParams.get('fund_id');

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from_date and to_date (YYYY-MM-DD) are required' }, { status: 400 });
  }

  const supabase = createServerClient();
  await refreshObligationStatuses(supabase, profile.tenant_id);

  let q = supabase
    .from('vc_reporting_obligations')
    .select(
      'id, fund_id, report_type, period_year, period_month, period_label, due_date, status, submitted_date, document_path, document_name, snapshot_extracted, snapshot_id',
    )
    .eq('tenant_id', profile.tenant_id)
    .gte('due_date', from)
    .lte('due_date', to)
    .order('due_date', { ascending: true });

  if (fundId) {
    q = q.eq('fund_id', fundId);
  }

  /** Cap very wide date windows so a single request cannot scan unbounded rows. */
  const { data, error } = await q.limit(2500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const fundIds = [...new Set(rows.map((r) => (r as { fund_id: string }).fund_id))];
  const nameById = new Map<string, string>();
  if (fundIds.length > 0) {
    const { data: fnRows } = await supabase
      .from('vc_portfolio_funds')
      .select('id, fund_name')
      .eq('tenant_id', profile.tenant_id)
      .in('id', fundIds);
    for (const fr of fnRows ?? []) {
      const x = fr as { id: string; fund_name: string };
      nameById.set(x.id, x.fund_name);
    }
  }

  const items = rows.map((raw) => {
    const r = raw as { fund_id: string };
    return { ...raw, fund_name: nameById.get(r.fund_id) ?? 'Fund' };
  });

  return NextResponse.json({ obligations: items });
}
