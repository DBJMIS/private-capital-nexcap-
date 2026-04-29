import type { Metadata } from 'next';

import { PortfolioReportingCalendar } from '@/components/portfolio/PortfolioReportingCalendar';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { calendarMonthGridRange } from '@/lib/portfolio/calendar-grid-range';

export const metadata: Metadata = {
  title: 'Reporting Calendar',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioCalendarPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const canWrite = Boolean(can(profile, 'write:applications'));
  const submitterName = profile.full_name?.trim() || 'Staff';

  const supabase = createServerClient();

  const now = new Date();
  const { from, to } = calendarMonthGridRange(now);

  const [{ data: obligationRows }, { data: fundRows }] = await Promise.all([
    supabase
      .from('vc_reporting_obligations')
      .select(
        'id, fund_id, report_type, period_year, period_month, period_label, due_date, status, submitted_date, document_path, document_name, snapshot_extracted, snapshot_id',
      )
      .eq('tenant_id', profile.tenant_id)
      .gte('due_date', from)
      .lte('due_date', to)
      .order('due_date', { ascending: true })
      .limit(2500),
    supabase
      .from('vc_portfolio_funds')
      .select('id, fund_name')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_status', 'active')
      .order('fund_name'),
  ]);

  const rows = obligationRows ?? [];
  const fundIds = [...new Set(rows.map((r) => (r as { fund_id: string }).fund_id))];
  const nameById = new Map<string, string>();
  for (const fr of fundRows ?? []) {
    const x = fr as { id: string; fund_name: string };
    nameById.set(x.id, x.fund_name);
  }
  const initialObligations = rows.map((raw) => {
    const r = raw as { fund_id: string };
    return { ...raw, fund_name: nameById.get(r.fund_id) ?? 'Fund' };
  });

  const initialFunds = (fundRows ?? []).map((f) => {
    const x = f as { id: string; fund_name: string };
    return { id: x.id, fund_name: x.fund_name };
  });

  return (
    <div className="min-h-[60vh] w-full">
      <PortfolioReportingCalendar
        canWrite={canWrite}
        submitterName={submitterName}
        initialObligations={initialObligations}
        initialFunds={initialFunds}
        initialMonth={now.getMonth()}
        initialYear={now.getFullYear()}
      />
    </div>
  );
}
