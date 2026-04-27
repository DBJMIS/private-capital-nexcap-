import Link from 'next/link';
import { ClipboardList } from 'lucide-react';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { dsCard } from '@/components/ui/design-system';
import { FundApplicationsListClient, type FundApplicationRow } from '@/components/fund-applications/FundApplicationsListClient';
import type { ActiveCfpOption } from '@/components/fund-applications/AssignCfpMenu';

export const dynamic = 'force-dynamic';

export default async function FundApplicationsPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return <p className="text-sm text-red-600">Forbidden</p>;
  }

  const supabase = createServerClient();
  const { data: rows } = await supabase
    .from('vc_fund_applications')
    .select('id, fund_name, status, submitted_at, created_at, cfp_id')
    .eq('tenant_id', profile.tenant_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  const list = (rows ?? []) as Array<{
    id: string;
    fund_name: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
    cfp_id: string | null;
  }>;

  const cfpIds = [...new Set(list.map((r) => r.cfp_id).filter((x): x is string => !!x))];
  const cfpTitleById = new Map<string, string>();
  if (cfpIds.length) {
    const { data: cfps } = await supabase.from('vc_cfps').select('id, title').eq('tenant_id', profile.tenant_id).in('id', cfpIds);
    for (const c of cfps ?? []) {
      cfpTitleById.set((c as { id: string }).id, (c as { title: string }).title);
    }
  }

  const { data: activeRows } = await supabase
    .from('vc_cfps')
    .select('id, title, closing_date')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'active')
    .order('closing_date', { ascending: true });

  const activeCfps: ActiveCfpOption[] = (activeRows ?? []).map((r) => ({
    id: (r as { id: string }).id,
    title: (r as { title: string }).title,
    closing_date: (r as { closing_date: string }).closing_date,
  }));

  const initialRows: FundApplicationRow[] = list.map((r) => ({
    ...r,
    cfp_title: r.cfp_id ? cfpTitleById.get(r.cfp_id) ?? null : null,
  }));

  const empty = list.length === 0;

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45]">Fund applications</h1>
          <p className="mt-1 text-sm text-gray-400">Review and assign applications to calls for proposals</p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition-colors hover:border-gray-400"
        >
          <Link href="/questionnaires">Questionnaires</Link>
        </Button>
      </div>

      <section className={dsCard.padded}>
        <SectionHeader icon={ClipboardList} iconVariant="navy" title="Applications" count={list.length} />

        {empty ? (
          <EmptyState
            icon={ClipboardList}
            title="No applications yet"
            subtitle="Applications appear here once they are created for your tenant."
          />
        ) : (
          <FundApplicationsListClient initialRows={initialRows} activeCfps={activeCfps} />
        )}
      </section>
    </div>
  );
}
