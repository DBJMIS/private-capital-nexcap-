import type { SupabaseClient } from '@supabase/supabase-js';

import type { PortfolioFundRow, PortfolioReportType, ReportingObligationInsert } from '@/lib/portfolio/types';

const MS_PER_DAY = 86400000;

/**
 * Quarter-end months for a fund from its fiscal year-end month.
 * e.g. year_end = 9 → [3, 6, 9, 12]; year_end = 12 → [3, 6, 9, 12]; year_end = 6 → [3, 6, 9, 12].
 */
export function getQuarterMonths(yearEndMonth: number): number[] {
  const ye = Math.min(12, Math.max(1, Math.floor(yearEndMonth)));
  const months: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const month = ((ye - 1 + (i * 3) + 3) % 12) + 1;
    months.push(month);
  }
  return [...months].sort((a, b) => a - b);
}

/** Last calendar day of `month` (1–12) in `year`, as local Date at noon. */
export function getMonthEnd(year: number, month: number): Date {
  const m = Math.min(12, Math.max(1, Math.floor(month)));
  return new Date(year, m, 0, 12, 0, 0, 0);
}

export function calculateDueDate(periodEndDate: Date, dueDays: number): Date {
  const due = new Date(periodEndDate);
  due.setDate(due.getDate() + Math.max(0, Math.floor(dueDays)));
  return due;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getPeriodLabel(
  periodYear: number,
  periodMonth: number,
  reportType: string,
  yearEndMonth: number,
): string {
  const monthName = MONTH_NAMES[periodMonth - 1] ?? String(periodMonth);
  if (reportType === 'audited_annual') {
    return `FY ${periodYear} Audited`;
  }
  const quarterMonths = getQuarterMonths(yearEndMonth);
  const quarterIndex = quarterMonths.indexOf(periodMonth);
  if (quarterIndex === -1) {
    return `${monthName} ${periodYear}`;
  }
  return `Q${quarterIndex + 1} ${periodYear}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Generates reporting obligations from commitment date through end of next calendar year.
 * Idempotent: upserts on (fund_id, report_type, period_year, period_month) with ignoreDuplicates.
 */
export async function generateReportingObligations(
  supabase: SupabaseClient,
  fund: PortfolioFundRow,
): Promise<{ inserted: number }> {
  const obligations: ReportingObligationInsert[] = [];
  const startDate = startOfDay(new Date(fund.commitment_date));
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);
  endDate.setMonth(11, 31);
  endDate.setHours(23, 59, 59, 999);

  const quarterMonths =
    Array.isArray(fund.report_months) && fund.report_months.length === 4
      ? [...fund.report_months].sort((a, b) => a - b)
      : getQuarterMonths(fund.year_end_month);

  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    for (const month of quarterMonths) {
      const periodEnd = getMonthEnd(year, month);
      if (periodEnd < startDate) continue;
      if (periodEnd > endDate) continue;

      const isYearEnd = month === fund.year_end_month;
      const periodLabelBase = (rt: PortfolioReportType) => getPeriodLabel(year, month, rt, fund.year_end_month);

      if (fund.requires_quarterly_financial && !isYearEnd) {
        const due = calculateDueDate(periodEnd, fund.quarterly_report_due_days);
        obligations.push({
          tenant_id: fund.tenant_id,
          fund_id: fund.id,
          report_type: 'quarterly_financial',
          period_year: year,
          period_month: month,
          period_label: periodLabelBase('quarterly_financial'),
          due_date: toDateStr(due),
          status: 'pending',
        });
      }

      if (fund.requires_quarterly_inv_mgmt && !isYearEnd) {
        const due = calculateDueDate(periodEnd, fund.quarterly_report_due_days);
        obligations.push({
          tenant_id: fund.tenant_id,
          fund_id: fund.id,
          report_type: 'quarterly_investment_mgmt',
          period_year: year,
          period_month: month,
          period_label: periodLabelBase('quarterly_investment_mgmt'),
          due_date: toDateStr(due),
          status: 'pending',
        });
      }

      if (fund.requires_inhouse_quarterly) {
        const due = calculateDueDate(periodEnd, fund.quarterly_report_due_days);
        obligations.push({
          tenant_id: fund.tenant_id,
          fund_id: fund.id,
          report_type: 'inhouse_quarterly',
          period_year: year,
          period_month: month,
          period_label: periodLabelBase('inhouse_quarterly'),
          due_date: toDateStr(due),
          status: 'pending',
        });
      }

      if (fund.requires_audited_annual && isYearEnd) {
        const due = calculateDueDate(periodEnd, fund.audit_report_due_days);
        obligations.push({
          tenant_id: fund.tenant_id,
          fund_id: fund.id,
          report_type: 'audited_annual',
          period_year: year,
          period_month: month,
          period_label: periodLabelBase('audited_annual'),
          due_date: toDateStr(due),
          status: 'pending',
        });
      }
    }
  }

  if (obligations.length === 0) {
    return { inserted: 0 };
  }

  const { error } = await supabase.from('vc_reporting_obligations').upsert(obligations, {
    onConflict: 'fund_id,report_type,period_year,period_month',
    ignoreDuplicates: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { inserted: obligations.length };
}

/**
 * Updates workflow statuses and persisted days_overdue for obligations in a tenant.
 */
export async function refreshObligationStatuses(supabase: SupabaseClient, tenantId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const in14 = new Date(today);
  in14.setDate(in14.getDate() + 14);
  const in14Str = toDateStr(in14);

  const minus30 = new Date(today);
  minus30.setDate(minus30.getDate() - 30);
  const minus30Str = toDateStr(minus30);

  await Promise.all([
    supabase
      .from('vc_reporting_obligations')
      .update({ status: 'due' })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .lte('due_date', in14Str)
      .gte('due_date', todayStr),
    supabase
      .from('vc_reporting_obligations')
      .update({ status: 'outstanding' })
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'due'])
      .lt('due_date', todayStr),
    supabase
      .from('vc_reporting_obligations')
      .update({ status: 'overdue' })
      .eq('tenant_id', tenantId)
      .eq('status', 'outstanding')
      .lt('due_date', minus30Str),
  ]);

  const { data: rows } = await supabase
    .from('vc_reporting_obligations')
    .select('id, due_date, status')
    .eq('tenant_id', tenantId)
    .in('status', ['outstanding', 'overdue']);

  const dueMs = today.getTime();
  const overdueUpdates: Promise<unknown>[] = [];
  for (const row of rows ?? []) {
    const r = row as { id: string; due_date: string; status: string };
    const due = new Date(`${r.due_date}T12:00:00`);
    const days = Math.max(0, Math.floor((dueMs - due.getTime()) / MS_PER_DAY));
    if (r.status === 'outstanding' || r.status === 'overdue') {
      overdueUpdates.push(
        Promise.resolve(
          supabase.from('vc_reporting_obligations').update({ days_overdue: days }).eq('id', r.id).eq('tenant_id', tenantId),
        ),
      );
    }
  }
  if (overdueUpdates.length > 0) {
    await Promise.all(overdueUpdates);
  }
}
