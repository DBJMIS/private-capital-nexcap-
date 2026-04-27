/**
 * Shared loader for authenticated report API handlers.
 * File path: lib/reports/api-load.ts
 */

import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import {
  buildReportFilters,
  countApplicationsThisUtcYear,
  filterApplicationsDimensions,
  type ReportFilters,
} from '@/lib/reports/filters';
import { filterApplications, loadApplicationsForReports } from '@/lib/reports/queries';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ReportApiContext = {
  supabase: SupabaseClient;
  tenantId: string;
  f: ReportFilters;
  apps: Awaited<ReturnType<typeof loadApplicationsForReports>>;
  filterApps: ReturnType<typeof filterApplications>;
  applicationsThisYearCount: number;
};

export async function loadReportFilterContext(request: Request): Promise<ReportApiContext | NextResponse> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile?.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const f = buildReportFilters({
    range: url.searchParams.get('range'),
    sector: url.searchParams.get('sector'),
    geography: url.searchParams.get('geography'),
  });

  const apps = await loadApplicationsForReports(supabase, profile.tenant_id);
  const dimApps = filterApplicationsDimensions(apps, f);
  const filterApps = filterApplications(apps, f);
  const applicationsThisYearCount = countApplicationsThisUtcYear(dimApps);

  return {
    supabase,
    tenantId: profile.tenant_id,
    f,
    apps,
    filterApps,
    applicationsThisYearCount,
  };
}
