import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { refreshObligationStatuses } from '@/lib/portfolio/reporting-engine';
import { loadComplianceFundRows } from '@/lib/portfolio/compliance-fund-rows';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  await refreshObligationStatuses(supabase, profile.tenant_id);

  const { funds, rows, error } = await loadComplianceFundRows(supabase, profile.tenant_id);

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  console.log('Funds loaded:', funds?.length);
  const first = funds?.[0] as { vc_reporting_obligations?: unknown[] } | undefined;
  console.log('First fund obligations:', first?.vc_reporting_obligations?.length);

  return NextResponse.json({ funds: rows });
}
