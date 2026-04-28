import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const MAX_UNPAGED = 2000;

const OBLIGATION_SELECT =
  'id, fund_id, report_type, period_label, period_year, period_month, due_date, status, days_overdue, escalation_level, escalated_at, escalated_to, reminder_sent_at, reminder_sent_to';

function clampPage(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10_000);
}

/** GET overdue obligations. Supports fund/report filters, sort, and server pagination (page + page_size). */
export async function GET(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const fundFilter = url.searchParams.get('fund_id')?.trim() || '';
  const reportType = url.searchParams.get('report_type')?.trim() || '';
  const sort = url.searchParams.get('sort') ?? 'days';
  const page = clampPage(parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSizeRaw = parseInt(url.searchParams.get('page_size') ?? String(PAGE_SIZE), 10);
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : PAGE_SIZE;
  const paged = url.searchParams.get('paged') !== '0';

  const supabase = createServerClient();

  let q = supabase
    .from('vc_reporting_obligations')
    .select(OBLIGATION_SELECT, paged && sort === 'days' ? { count: 'exact' } : undefined)
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'overdue');
  if (fundFilter) q = q.eq('fund_id', fundFilter);
  if (reportType) q = q.eq('report_type', reportType);

  if (sort === 'due') q = q.order('due_date', { ascending: true });
  else if (sort === 'fund') q = q.order('fund_id', { ascending: true }).order('due_date', { ascending: true });
  else q = q.order('days_overdue', { ascending: false });

  let rows: unknown[] | null = null;
  let error: { message: string } | null = null;
  let total: number | null = null;

  if (paged && sort === 'days') {
    const from = (page - 1) * pageSize;
    const res = await q.range(from, from + pageSize - 1);
    rows = res.data as unknown[] | null;
    error = res.error;
    total = res.count ?? null;
  } else {
    const res = await q.limit(MAX_UNPAGED);
    rows = res.data as unknown[] | null;
    error = res.error;
    total = rows?.length ?? 0;
  }

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

  const totalPages = paged && sort === 'days' && total != null ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  return NextResponse.json({
    obligations,
    total: total ?? obligations.length,
    page: paged && sort === 'days' ? page : 1,
    pageSize: paged && sort === 'days' ? pageSize : obligations.length,
    totalPages,
    paged: paged && sort === 'days',
  });
}
