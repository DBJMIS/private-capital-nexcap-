import type { Metadata } from 'next';

import { ComplianceDashboardClient } from '@/components/portfolio/ComplianceDashboardClient';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import type { ComplianceFundWithObligations } from '@/lib/portfolio/compliance-fund-rows';
import { loadComplianceFundRows } from '@/lib/portfolio/compliance-fund-rows';

export const metadata: Metadata = {
  title: 'Compliance',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioCompliancePage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const supabase = createServerClient();

  const { funds, rows, error } = await loadComplianceFundRows(supabase, profile.tenant_id);

  if (error) {
    return <p className="text-sm text-red-700">Error: {error}</p>;
  }

  return (
    <ComplianceDashboardClient
      initialRows={rows}
      initialFunds={(funds ?? []) as ComplianceFundWithObligations[]}
    />
  );
}
