import Link from 'next/link';
import { Building2, Calendar, ListChecks, ShieldAlert } from 'lucide-react';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

export async function PortfolioEpic4Strip() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return null;
  }

  const supabase = createServerClient();

  const today = new Date().toISOString().split('T')[0]!;
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 0)
    .toISOString()
    .split('T')[0]!;

  const { count: fundCount } = await supabase
    .from('vc_portfolio_funds')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id)
    .eq('fund_status', 'active');

  const { count: dueThisMonth } = await supabase
    .from('vc_reporting_obligations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id)
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd);

  const { count: overdue } = await supabase
    .from('vc_reporting_obligations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id)
    .in('status', ['overdue', 'outstanding']);

  const { count: pendingReview } = await supabase
    .from('vc_reporting_obligations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id)
    .in('status', ['submitted', 'under_review']);

  const cards = [
    { label: 'Active funds', value: fundCount ?? 0, href: '/portfolio/funds', icon: Building2 },
    { label: 'Reports due this month', value: dueThisMonth ?? 0, href: '/portfolio/calendar', icon: Calendar },
    { label: 'Outstanding / overdue', value: overdue ?? 0, href: '/portfolio/funds', icon: ShieldAlert },
    { label: 'Pending review', value: pendingReview ?? 0, href: '/portfolio/funds', icon: ListChecks },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0B1F45]">Fund commitments &amp; reporting</h2>
          <p className="text-sm text-gray-500">Post-commitment monitoring (Epic 4)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/portfolio/funds"
            className="rounded-lg bg-[#0B1F45] px-4 py-2 text-sm font-medium text-white hover:bg-[#162d5e]"
          >
            Fund monitoring
          </Link>
          <Link
            href="/portfolio/calendar"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#0B1F45] hover:bg-gray-50"
          >
            Reporting calendar
          </Link>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-gray-100 bg-[#EEF3FB] px-4 py-3 transition hover:border-[#C8973A]/40',
            )}
          >
            <c.icon className="h-8 w-8 shrink-0 text-[#C8973A]" aria-hidden />
            <div>
              <p className="text-2xl font-bold text-[#0B1F45]">{c.value}</p>
              <p className="text-xs text-gray-500">{c.label}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
