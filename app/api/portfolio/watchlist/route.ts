import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import type { VcQuarterlyAssessment, VcWatchlistEntry } from '@/types/database';
import type { WatchlistFundRow } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const { data: wlRows, error } = await supabase
    .from('vc_watchlist')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('escalated', { ascending: false })
    .order('consecutive_quarters', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (wlRows ?? []) as VcWatchlistEntry[];
  if (list.length === 0) return NextResponse.json({ rows: [] as WatchlistFundRow[] });

  const fundIds = [...new Set(list.map((w) => w.fund_id))];
  const { data: funds } = await supabase
    .from('vc_portfolio_funds')
    .select('id, fund_name, currency, is_pvc')
    .eq('tenant_id', profile.tenant_id)
    .in('id', fundIds);
  const fundMap = new Map((funds ?? []).map((f) => [(f as { id: string }).id, f as { fund_name: string; currency: string; is_pvc: boolean | null }]));

  const assessIds = list.map((w) => w.last_assessment_id).filter((x): x is string => !!x);
  const { data: assess } = assessIds.length
    ? await supabase
        .from('vc_quarterly_assessments')
        .select('id, weighted_total_score, category, divestment_recommendation, assessment_period')
        .eq('tenant_id', profile.tenant_id)
        .in('id', assessIds)
    : { data: [] as VcQuarterlyAssessment[] };
  const assessMap = new Map((assess ?? []).map((r) => [(r as { id: string }).id, r as VcQuarterlyAssessment]));

  const rows: WatchlistFundRow[] = list.map((w) => {
    const f = fundMap.get(w.fund_id);
    const la = w.last_assessment_id ? assessMap.get(w.last_assessment_id) : undefined;
    return {
      watchlist: w,
      fund_name: f?.fund_name ?? '—',
      currency: f?.currency ?? 'USD',
      is_pvc: f?.is_pvc ?? null,
      last_weighted_total_score: la?.weighted_total_score != null ? Number(la.weighted_total_score) : null,
      last_category: la?.category ?? null,
      last_divestment_recommendation: la?.divestment_recommendation ?? null,
      last_assessment_period: la?.assessment_period ?? null,
    };
  });

  return NextResponse.json({ rows });
}
