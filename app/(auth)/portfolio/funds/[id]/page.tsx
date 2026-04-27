import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { FundDetailClient } from '@/components/portfolio/FundDetailClient';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { refreshObligationStatuses } from '@/lib/portfolio/reporting-engine';
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
  await refreshObligationStatuses(supabase, profile.tenant_id);

  const { data: fund, error } = await supabase
    .from('vc_portfolio_funds')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();

  if (error || !fund) notFound();

  const { data: obligations } = await supabase
    .from('vc_reporting_obligations')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_id', id)
    .order('due_date', { ascending: true });

  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-gray-500">Loading fund…</div>}>
      <FundDetailClient
        fund={fund as Row}
        obligations={(obligations ?? []) as Record<string, unknown>[]}
        canWrite={can(profile, 'write:applications')}
        canDeleteSnapshots={can(profile, 'delete:records')}
      />
    </Suspense>
  );
}
