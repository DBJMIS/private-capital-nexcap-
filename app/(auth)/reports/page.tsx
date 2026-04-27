import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ExecutiveReportsDashboard } from '@/components/reports/ExecutiveReportsDashboard';
import { getProfile } from '@/lib/auth/session';
import {
  buildReportFilters,
  countApplicationsThisUtcYear,
  filterApplicationsDimensions,
} from '@/lib/reports/filters';
import {
  filterApplications,
  getAssessmentAnalytics,
  getCapitalSummary,
  getCriteriaBreakdown,
  getExecutiveKpis,
  getPipelineFunnel,
  getPortfolioSummary,
  loadApplicationsForReports,
} from '@/lib/reports/queries';
import { createServerClient } from '@/lib/supabase/server';
import { describeSupabaseLoadFailure } from '@/lib/supabase/query-errors';
import { sectorFromApplication } from '@/lib/portfolio/queries';

export const metadata: Metadata = {
  title: 'Executive reporting',
};

export const revalidate = 60;

type Search = { [key: string]: string | string[] | undefined };

function first(sp: Search, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const profile = await getProfile();
  if (!profile?.tenant_id) {
    redirect('/login');
  }

  const sp = await searchParams;
  const supabase = createServerClient();
  const f = buildReportFilters({
    range: first(sp, 'range'),
    sector: first(sp, 'sector'),
    geography: first(sp, 'geography'),
  });

  try {
    const apps = await loadApplicationsForReports(supabase, profile.tenant_id);
    const dimApps = filterApplicationsDimensions(apps, f);
    const filterApps = filterApplications(apps, f);
    const applicationsThisYearCount = countApplicationsThisUtcYear(dimApps);

    const [kpis, funnel, capital, portfolio, assessment, criteria] = await Promise.all([
      getExecutiveKpis(supabase, profile.tenant_id, filterApps, f, applicationsThisYearCount),
      getPipelineFunnel(supabase, profile.tenant_id, filterApps),
      getCapitalSummary(supabase, profile.tenant_id, filterApps, f),
      getPortfolioSummary(supabase, profile.tenant_id, filterApps),
      getAssessmentAnalytics(supabase, profile.tenant_id, filterApps),
      getCriteriaBreakdown(supabase, profile.tenant_id, filterApps),
    ]);

    const sectorSet = new Set<string>();
    for (const a of apps) {
      sectorSet.add(sectorFromApplication(a));
    }
    const sectors = [...sectorSet].filter((s) => s !== 'Unknown').sort((a, b) => a.localeCompare(b));
    if (sectorSet.has('Unknown')) sectors.push('Unknown');

    const geoSet = new Set<string>();
    for (const a of apps) {
      const g = a.geographic_area?.trim();
      if (g) geoSet.add(g);
    }
    const geographies = [...geoSet].sort((a, b) => a.localeCompare(b));

    return (
      <ExecutiveReportsDashboard
        filter={{
          range: f.range,
          sector: f.sector,
          geography: f.geography,
        }}
        sectors={sectors}
        geographies={geographies}
        kpis={kpis}
        funnel={funnel}
        capital={capital}
        portfolio={portfolio}
        assessment={assessment}
        criteria={criteria}
      />
    );
  } catch (e) {
    const message = describeSupabaseLoadFailure(e);
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-xl font-semibold text-navy">Executive reporting</p>
        <p className="mt-4 text-sm leading-relaxed text-gray-700">{message}</p>
        <p className="mt-6 text-xs text-gray-500">
          This page loads metrics from Supabase. If you are developing locally, run the Supabase stack or point env vars
          at a hosted project, then reload.
        </p>
      </div>
    );
  }
}
