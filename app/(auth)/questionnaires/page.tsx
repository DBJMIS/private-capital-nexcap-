import { ClipboardList } from 'lucide-react';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { ActionButton } from '@/components/ui/ActionButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { dsCard, dsTable } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function QuestionnairesListPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = createServerClient();
  const { data: rows } = await supabase
    .from('vc_dd_questionnaires')
    .select('id, status, application_id, created_at')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false });

  const apps = new Map<string, { fund_name: string }>();
  const appIds = [...new Set((rows ?? []).map((r: { application_id: string }) => r.application_id))];
  if (appIds.length) {
    const { data: appsRows } = await supabase
      .from('vc_fund_applications')
      .select('id, fund_name')
      .eq('tenant_id', profile.tenant_id)
      .in('id', appIds);
    for (const a of appsRows ?? []) {
      apps.set(a.id, { fund_name: a.fund_name });
    }
  }

  const list = rows ?? [];
  const empty = list.length === 0;

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0B1F45]">DD Questionnaires</h1>
        <p className="mt-1 text-sm text-gray-400">
          Open and complete due diligence questionnaires for fund applications.
        </p>
      </div>

      {empty ? (
        <div className={cn(dsCard.shell)}>
          <EmptyState
            icon={ClipboardList}
            title="No questionnaires yet"
            subtitle="They are created when a fund application passes pre-screening."
          />
        </div>
      ) : (
        <section className={dsCard.padded}>
          <SectionHeader icon={ClipboardList} iconVariant="navy" title="Questionnaires" count={list.length} />
          <div className={cn(dsTable.container)}>
            <table className="min-w-full divide-y divide-gray-100">
              <thead className={dsTable.thead}>
                <tr>
                  <th className={dsTable.th}>Fund</th>
                  <th className={dsTable.th}>Status</th>
                  <th className={cn(dsTable.th, 'text-right')}> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {list.map((q: { id: string; status: string; application_id: string }) => {
                  const fundName = apps.get(q.application_id)?.fund_name?.trim() || 'Fund application';
                  return (
                    <tr key={q.id} className={dsTable.rowHover}>
                      <td className={cn(dsTable.td, 'font-medium text-gray-900')}>{fundName}</td>
                      <td className={dsTable.td}>
                        <StatusBadge status={q.status} />
                      </td>
                      <td className={cn(dsTable.td, 'text-right')}>
                        <ActionButton href={`/questionnaires/${q.id}`}>Open</ActionButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
