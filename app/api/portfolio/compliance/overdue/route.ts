import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('vc_reporting_obligations')
    .select(
      'id, fund_id, report_type, period_label, period_year, period_month, due_date, status, days_overdue, escalation_level, escalated_at, escalated_to, reminder_sent_at, reminder_sent_to',
    )
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'overdue')
    .order('days_overdue', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const fundIds = [...new Set(list.map((r) => (r as { fund_id: string }).fund_id))];
  const fundMap = new Map<string, { fund_name: string; currency: string }>();
  if (fundIds.length > 0) {
    const { data: funds } = await supabase
      .from('vc_portfolio_funds')
      .select('id, fund_name, currency')
      .eq('tenant_id', profile.tenant_id)
      .in('id', fundIds);
    for (const f of funds ?? []) {
      const row = f as { id: string; fund_name: string; currency: string };
      fundMap.set(row.id, { fund_name: row.fund_name, currency: row.currency });
    }
  }

  const obligations = list.map((r) => {
    const row = r as Record<string, unknown>;
    const fund = fundMap.get(row.fund_id as string);
    return {
      id: row.id,
      fund_id: row.fund_id,
      fund_name: fund?.fund_name ?? '',
      currency: fund?.currency ?? '',
      report_type: row.report_type,
      period_label: row.period_label,
      period_year: row.period_year,
      period_month: row.period_month,
      due_date: row.due_date,
      status: row.status,
      days_overdue: row.days_overdue,
      escalation_level: row.escalation_level,
      escalated_at: row.escalated_at,
      escalated_to: row.escalated_to,
      reminder_sent_at: row.reminder_sent_at,
      reminder_sent_to: row.reminder_sent_to,
    };
  });

  return NextResponse.json({ obligations });
}
