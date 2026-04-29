import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { FundDetailClient } from '@/components/portfolio/FundDetailClient';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  computeFundObligationOverview,
  type FundObligationOverviewObligation,
} from '@/lib/portfolio/fund-obligation-overview';
import type { PortfolioFundRow } from '@/lib/portfolio/types';

export const dynamic = 'force-dynamic';

type Row = PortfolioFundRow & { id: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Fund · ${id.slice(0, 8)}…` };
}

export default async function PortfolioFundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const { id } = await params;
  const supabase = createServerClient();

  const [{ data: fund, error }, { data: obligations }] = await Promise.all([
    supabase.from('vc_portfolio_funds').select('*').eq('tenant_id', profile.tenant_id).eq('id', id).maybeSingle(),
    supabase
      .from('vc_reporting_obligations')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_id', id)
      .order('due_date', { ascending: true }),
  ]);

  if (error || !fund) notFound();

  const allObs = (obligations ?? []) as FundObligationOverviewObligation[];
  const obligationOverview = computeFundObligationOverview(allObs);
  const sortedDesc = [...allObs].sort((a, b) => b.due_date.localeCompare(a.due_date));
  const initialReportingRows = sortedDesc.slice(0, 20);
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-gray-500">Loading fund…</div>}>
      <FundDetailClient
        fund={fund as Row}
        obligationOverview={obligationOverview}
        obligationCount={allObs.length}
        initialReportingRows={initialReportingRows as Record<string, unknown>[]}
        canWrite={can(profile, 'write:applications')}
        canDeleteSnapshots={can(profile, 'delete:records')}
      />
    </Suspense>
  );
}
