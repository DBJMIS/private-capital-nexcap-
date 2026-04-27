import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { loadActivePortfolioRows } from '@/lib/portfolio/load-portfolio-data';
import type { PerformanceBand } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

const BANDS: PerformanceBand[] = ['performing', 'watch', 'underperforming', 'critical'];

export async function GET(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const sector = searchParams.get('sector');
  const band = searchParams.get('band');
  const search = searchParams.get('search')?.trim().toLowerCase() ?? '';

  let rows = await loadActivePortfolioRows(supabase, profile.tenant_id);

  if (sector && sector !== 'all' && sector.length > 0) {
    rows = rows.filter((r) => r.sector === sector);
  }

  if (band && band !== 'all' && BANDS.includes(band as PerformanceBand)) {
    rows = rows.filter((r) => r.performance_band === band);
  }

  if (search) {
    rows = rows.filter((r) => r.fund_name.toLowerCase().includes(search));
  }

  return NextResponse.json({ investments: rows });
}
