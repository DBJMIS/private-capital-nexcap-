import type { Metadata } from 'next';
import { Activity, BarChart3, FileSpreadsheet, LayoutDashboard } from 'lucide-react';

import { StatCard } from '@/components/ui/StatCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { dsCard, dsTable, scoreValueClass } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile) {
    return null;
  }

  const supabase = createServerClient();
  const { metrics, funnelStages, recentRows, activity } = await loadDashboardData(supabase, profile.tenant_id);

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45]">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">Pipeline overview and recent applications</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} accent={m.accent} icon={BarChart3} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-10">
        <section className={cn(dsCard.padded, 'lg:col-span-7')}>
          <SectionHeader icon={FileSpreadsheet} iconVariant="navy" title="Recent applications" />
          <div className={cn(dsTable.container)}>
            <table className="min-w-full divide-y divide-gray-100">
              <thead className={dsTable.thead}>
                <tr>
                  <th className={dsTable.th}>Fund name</th>
                  <th className={dsTable.th}>Manager</th>
                  <th className={dsTable.th}>Submitted</th>
                  <th className={dsTable.th}>Status</th>
                  <th className={cn(dsTable.th, 'text-right')}>Score</th>
                  <th className={cn(dsTable.th, 'text-right')}> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {recentRows.length === 0 ? (
                  <tr>
                    <td className={dsTable.td} colSpan={6}>
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileSpreadsheet className="mb-3 h-12 w-12 text-gray-300" aria-hidden />
                        <p className="text-sm font-medium text-gray-500">No applications yet</p>
                        <p className="mt-1 text-xs text-gray-400">Applications will appear here once submitted.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentRows.map((r) => (
                    <tr key={r.id} className={dsTable.rowHover}>
                      <td className={cn(dsTable.td, 'font-medium text-gray-900')}>{r.fund}</td>
                      <td className={dsTable.td}>{r.manager}</td>
                      <td className={cn(dsTable.td, 'text-gray-500')}>{r.submitted}</td>
                      <td className={dsTable.td}>
                        <StatusBadge status={r.statusKey} />
                      </td>
                      <td
                        className={cn(
                          dsTable.td,
                          'text-right',
                          r.score != null ? scoreValueClass(r.score) : 'font-mono text-sm text-gray-400',
                        )}
                      >
                        {r.score != null ? r.score : '—'}
                      </td>
                      <td className={cn(dsTable.td, 'text-right')}>
                        <ActionButton href={r.href}>Open</ActionButton>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6 lg:col-span-3">
          <section className={dsCard.padded}>
            <SectionHeader icon={LayoutDashboard} iconVariant="teal" title="Pipeline funnel" />
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
              {funnelStages.map((s) => (
                <li key={s.label} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-gray-700">{s.label}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-[#0B1F45]">{s.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={dsCard.padded}>
            <SectionHeader icon={Activity} iconVariant="gold" title="Recent activity" />
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
              {activity.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-gray-500">No recent activity.</li>
              ) : (
                activity.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <p className="text-xs text-gray-400">{a.at}</p>
                    <p className="mt-1 text-sm text-gray-700">{a.text}</p>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
