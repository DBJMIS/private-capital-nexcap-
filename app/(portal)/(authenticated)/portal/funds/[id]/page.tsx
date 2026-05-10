'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PortalApplicationOverviewCard } from '@/components/portal/PortalApplicationOverviewCard';
import { daysFromNow, formatPortalCurrency, formatPortalDate, formatReportType, snapshotPeriodLabel } from '@/lib/portal/format-helpers';
import type { PortalDashboardResponse } from '@/types/portal-dashboard';
import { cn } from '@/lib/utils';

const TABLER_ICONS_CSS =
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.26.0/dist/tabler-icons.min.css';

type FundData = Extract<PortalDashboardResponse, { state: 'active' }>['funds'][number];

function qState(q: FundData['questionnaire']) {
  if (!q) return 'not_started';
  if (q.status === 'completed' || q.all_complete) return 'completed';
  if (q.completed_sections > 0) return 'in_progress';
  return 'not_started';
}

function isCommittedStage(data: FundData): boolean {
  if (data.portfolio_fund != null) return true;
  return data.application != null && ['committed', 'funded', 'contract_signed'].includes(data.application.status);
}

function PortfolioOverviewSkeleton() {
  return (
    <div className="w-full space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-100" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-56 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-56 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-56 animate-pulse rounded-xl bg-gray-100" />
      </div>
    </div>
  );
}

function formatDaysAgo(isoDate: string | null): string {
  if (!isoDate?.trim()) return '—';
  const d = daysFromNow(isoDate.slice(0, 10));
  if (d === 0) return 'Today';
  if (d > 0) return `in ${d} day${d === 1 ? '' : 's'}`;
  const n = Math.abs(d);
  return `${n} day${n === 1 ? '' : 's'} ago`;
}

function barColorForCallStatus(status: string): string {
  if (status === 'paid') return '#1D9E75';
  if (status === 'overdue') return '#E24B4A';
  if (status === 'partial') return '#EF9F27';
  return '#9CA3AF';
}

function OnboardingOverview({ fund, id }: { fund: FundData; id: string }) {
  if (!fund.application) return null;
  const application = fund.application;
  const questionnaireState = qState(fund.questionnaire);
  const progressPct =
    fund.questionnaire && fund.questionnaire.total_sections > 0
      ? Math.round((fund.questionnaire.completed_sections / fund.questionnaire.total_sections) * 100)
      : 0;

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
      <p className="mt-1 text-sm text-gray-500">{application.fund_name}</p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <PortalApplicationOverviewCard
          application={fund.application}
          questionnaire={
            fund.questionnaire
              ? {
                  completed_sections: fund.questionnaire.completed_sections,
                  total_sections: fund.questionnaire.total_sections,
                  all_complete: fund.questionnaire.all_complete,
                }
              : null
          }
        />

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Due Diligence Questionnaire</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
              {questionnaireState === 'completed' ? 'Completed' : questionnaireState === 'in_progress' ? 'In progress' : 'Not started'}
            </span>
          </div>
          {fund.questionnaire ? (
            <>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-[#00A99D]" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {fund.questionnaire.completed_sections} of {fund.questionnaire.total_sections} sections complete
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-gray-600">No questionnaire linked yet.</p>
          )}
          <Link href={`/portal/funds/${id}/questionnaire`} className="mt-4 inline-flex rounded-lg bg-[#00A99D] px-4 py-2 text-sm font-semibold text-white">
            Open Questionnaire
          </Link>
        </section>

        {fund.portfolio_fund && fund.obligations ? (
          <div
            style={{
              background: 'white',
              border: '0.5px solid #EBEAE6',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 0,
            }}
            className="shadow-sm"
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '0.5px solid #EBEAE6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#9CA3AF',
                }}
              >
                Compliance
              </div>
              <Link
                href={`/portal/funds/${id}/compliance`}
                style={{
                  fontSize: 12,
                  color: '#1D9E75',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                View all →
              </Link>
            </div>
            {(() => {
              const ob = fund.obligations;
              if (!ob) return null;
              const overdueCount = ob.overdue_count ?? 0;
              const nextDue = ob.next_due;
              if (overdueCount === 0 && !nextDue) {
                return (
                  <div
                    style={{
                      padding: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#E1F5EE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <i className="ti ti-check" style={{ fontSize: 16, color: '#1D9E75' }} aria-hidden />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#085041' }}>Fully compliant</div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>No overdue or upcoming obligations</div>
                    </div>
                  </div>
                );
              }
              const dueStr = nextDue ? nextDue.due_date.slice(0, 10) : '';
              const diff = nextDue ? daysFromNow(dueStr) : 0;
              return (
                <div>
                  {overdueCount > 0 ? (
                    <div
                      style={{
                        padding: '12px 20px',
                        background: '#FCEBEB',
                        borderBottom: '0.5px solid #F09595',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className="ti ti-alert-circle" style={{ fontSize: 16, color: '#A32D2D', flexShrink: 0 }} aria-hidden />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#501313' }}>
                            {overdueCount} overdue obligation{overdueCount !== 1 ? 's' : ''}
                          </div>
                          <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 1 }}>Immediate action required</div>
                        </div>
                      </div>
                      <Link
                        href={`/portal/funds/${id}/compliance`}
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: '#A32D2D',
                          textDecoration: 'none',
                          background: 'white',
                          border: '0.5px solid #F09595',
                          borderRadius: 7,
                          padding: '5px 10px',
                          flexShrink: 0,
                        }}
                      >
                        Review now
                      </Link>
                    </div>
                  ) : null}
                  {nextDue ? (
                    <div
                      style={{
                        padding: '14px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 7,
                            background: '#FAEEDA',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <i className="ti ti-calendar-due" style={{ fontSize: 14, color: '#633806' }} aria-hidden />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{formatReportType(nextDue.report_type)}</div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                            {nextDue.period_label} · Due {formatPortalDate(dueStr)}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: diff < 0 ? '#A32D2D' : diff <= 7 ? '#854F0B' : '#6B7280',
                          textAlign: 'right',
                          flexShrink: 0,
                        }}
                      >
                        {diff < 0
                          ? `${Math.abs(diff)} days overdue`
                          : diff === 0
                            ? 'Due today'
                            : `Due in ${diff} days`}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        ) : null}

        {fund.portfolio_fund && fund.obligations ? (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Next Reporting Deadline</span>
            {fund.obligations.next_due ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-800">{formatReportType(fund.obligations.next_due.report_type)}</p>
                {(() => {
                  const d = fund.obligations!.next_due!.due_date.slice(0, 10);
                  const diff = daysFromNow(d);
                  return (
                    <>
                      <p className={cn('mt-2 text-2xl font-semibold', diff < 0 ? 'text-red-600' : 'text-gray-900')}>{formatPortalDate(d)}</p>
                      <p className="mt-1 text-sm text-gray-500">{fund.obligations!.next_due!.period_label}</p>
                    </>
                  );
                })()}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No upcoming deadlines.</p>
            )}
          </section>
        ) : null}

        {fund.portfolio_fund ? (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Capital Calls</span>
            {fund.capital_calls.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No capital calls</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {fund.capital_calls.map((c) => (
                  <li key={c.id} className="py-2">
                    <p className="text-lg font-semibold text-gray-900">{formatPortalCurrency(c.call_amount, c.currency)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      {fund.portfolio_fund && fund.latest_snapshot ? (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Portfolio Performance</span>
            <span className="text-xs text-gray-400">
              {snapshotPeriodLabel(fund.latest_snapshot.period_label, fund.latest_snapshot.period_year, fund.latest_snapshot.period_quarter)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-400">Net Asset Value</p>
              <p className="text-xl font-semibold text-gray-900">
                {fund.latest_snapshot.nav != null ? formatPortalCurrency(fund.latest_snapshot.nav, fund.portfolio_fund.currency) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-400">Reported IRR</p>
              <p className="text-xl font-semibold text-gray-900">
                {fund.latest_snapshot.reported_irr != null ? `${fund.latest_snapshot.reported_irr.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-400">DBJ Commitment</p>
              <p className="text-xl font-semibold text-gray-900">
                {fund.portfolio_fund.dbj_commitment != null ? formatPortalCurrency(fund.portfolio_fund.dbj_commitment, fund.portfolio_fund.currency) : '—'}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PortfolioOverview({ fund, id }: { fund: FundData; id: string }) {
  const application = fund.application;
  const portfolioFund = fund.portfolio_fund;
  const obligations = fund.obligations;
  const os = fund.obligations_summary;
  const capitalCalls = fund.capital_calls ?? [];

  const fundTitle = portfolioFund?.fund_name ?? application?.fund_name ?? 'Fund';
  const managerDisplay = portfolioFund?.manager_name ?? application?.manager_name ?? '—';
  const committedSource = portfolioFund?.commitment_date ?? application?.submitted_at ?? null;

  const currency = portfolioFund?.currency ?? 'USD';

  const dbjCommitment = portfolioFund?.dbj_commitment ?? 0;
  const totalCalled = capitalCalls.reduce((sum, c) => sum + Number(c.call_amount), 0);
  const remaining = dbjCommitment - totalCalled;
  const calledPct = dbjCommitment > 0 ? Math.min((totalCalled / dbjCommitment) * 100, 100) : 0;
  const remainingPct = dbjCommitment > 0 ? Math.max(0, Math.min(100, (remaining / dbjCommitment) * 100)) : 0;

  const overdueCount = os?.overdue ?? obligations?.overdue_count ?? 0;
  const pendingCount = os?.pending ?? obligations?.pending_count ?? 0;
  const acceptedComplianceCount = os?.accepted ?? 0;
  const nextDue = obligations?.next_due ?? null;

  const reportsAccepted = os?.accepted ?? 0;
  const reportsOverdue = os?.overdue ?? 0;
  const reportsTotal = os?.total ?? 0;
  const acceptedPct = reportsTotal > 0 ? (reportsAccepted / reportsTotal) * 100 : 0;
  const overduePct = reportsTotal > 0 ? (reportsOverdue / reportsTotal) * 100 : 0;

  const callsChartData = capitalCalls.map((c, idx) => ({
    name: `#${idx + 1}`,
    amount: Number(c.call_amount),
    status: c.status,
  }));

  const allPaid = capitalCalls.length > 0 && capitalCalls.every((c) => c.status === 'paid');
  const unpaidCount = capitalCalls.filter((c) => c.status !== 'paid' && c.status !== 'cancelled').length;

  const complianceData = useMemo(() => {
    const rows: Array<{ name: string; value: number; color: string }> = [
      { name: 'Overdue', value: overdueCount, color: '#E24B4A' },
      { name: 'Pending', value: pendingCount, color: '#EF9F27' },
      { name: 'Accepted', value: acceptedComplianceCount, color: '#1D9E75' },
    ];
    return rows.filter((d) => d.value > 0);
  }, [overdueCount, pendingCount, acceptedComplianceCount]);

  const nextDueDiff = nextDue ? daysFromNow(nextDue.due_date.slice(0, 10)) : null;

  return (
    <div className="w-full">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#111827', margin: 0 }}>Overview</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
          {fundTitle} · Active Portfolio Fund
        </p>
      </div>

      <div
        style={{
          background: 'white',
          border: '0.5px solid #EBEAE6',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 0,
        }}
        className="shadow-sm"
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '0.5px solid #EBEAE6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Fund Status</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 20,
              background: '#E1F5EE',
              color: '#085041',
              border: '0.5px solid #5DCAA5',
            }}
          >
            ✓ Active Portfolio
          </span>
        </div>
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          style={{ padding: '16px 20px' }}
        >
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 6 }}>Fund</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{portfolioFund?.fund_name ?? fundTitle}</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{managerDisplay}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 6 }}>Committed</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              {committedSource ? formatPortalDate(committedSource.slice(0, 10)) : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{formatDaysAgo(committedSource)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 6 }}>DBJ Commitment</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              {portfolioFund?.dbj_commitment != null ? formatPortalCurrency(portfolioFund.dbj_commitment, currency) : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 6 }}>Remaining</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#085041' }}>
              {portfolioFund?.dbj_commitment != null ? formatPortalCurrency(Math.max(0, remaining), currency) : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 4 }}>
              {portfolioFund?.dbj_commitment != null ? `${remainingPct.toFixed(0)}% remaining` : '—'}
            </div>
          </div>
        </div>
        <div
          style={{
            background: '#FAFAF9',
            borderTop: '0.5px solid #EBEAE6',
            padding: '12px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>Capital deployment</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#111827' }}>{calledPct.toFixed(0)}% called</span>
          </div>
          <div style={{ background: '#E5E7EB', height: 6, borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${calledPct}%`,
                height: '100%',
                borderRadius: 4,
                background: 'linear-gradient(90deg, #1D9E75, #00A99D)',
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div
          style={{
            background: 'white',
            border: '0.5px solid #EBEAE6',
            borderRadius: 12,
            overflow: 'hidden',
          }}
          className="shadow-sm"
        >
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '0.5px solid #EBEAE6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Capital Calls</span>
            <Link href={`/portal/funds/${id}/capital-calls`} style={{ fontSize: 12, color: '#1D9E75', fontWeight: 500, textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {capitalCalls.length === 0 ? (
              <p className="text-center text-sm text-gray-400">No capital calls yet</p>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>Total called to date</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginTop: 4 }}>{formatPortalCurrency(totalCalled, currency)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        display: 'inline-block',
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: '#E1F5EE',
                        color: '#085041',
                      }}
                    >
                      {capitalCalls.length} notices
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: allPaid ? '#085041' : '#854F0B', marginTop: 6 }}>
                      {allPaid ? 'All paid ✓' : unpaidCount > 0 ? `${unpaidCount} outstanding` : '—'}
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={callsChartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 9, fill: '#9CA3AF' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: unknown) => {
                        const n = typeof v === 'number' ? v : Number(v);
                        if (!Number.isFinite(n)) return '$0';
                        return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
                      }}
                    />
                    <Tooltip
                      formatter={(value: unknown) => {
                        const n = typeof value === 'number' ? value : Number(value);
                        return [`US$${Number.isFinite(n) ? n.toLocaleString() : '0'}`, 'Amount'];
                      }}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '0.5px solid #EBEAE6' }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {callsChartData.map((entry, i) => (
                        <Cell key={entry.name + String(i)} fill={barColorForCallStatus(entry.status)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            background: 'white',
            border: '0.5px solid #EBEAE6',
            borderRadius: 12,
            overflow: 'hidden',
          }}
          className="shadow-sm"
        >
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '0.5px solid #EBEAE6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Compliance</span>
            <Link href={`/portal/funds/${id}/compliance`} style={{ fontSize: 12, color: '#1D9E75', fontWeight: 500, textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {overdueCount > 0 ? (
            <div
              style={{
                padding: '12px 20px',
                background: '#FCEBEB',
                borderBottom: '0.5px solid #F09595',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 18, color: '#A32D2D' }} aria-hidden />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#501313' }}>{overdueCount} overdue</div>
                  <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 2 }}>Immediate action required</div>
                </div>
              </div>
              <Link
                href={`/portal/funds/${id}/compliance`}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#A32D2D',
                  textDecoration: 'none',
                  background: 'white',
                  border: '0.5px solid #F09595',
                  borderRadius: 6,
                  padding: '4px 8px',
                }}
              >
                Review
              </Link>
            </div>
          ) : (
            <div
              style={{
                padding: '12px 20px',
                background: '#E1F5EE',
                borderBottom: '0.5px solid #5DCAA5',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <i className="ti ti-circle-check" style={{ fontSize: 16, color: '#1D9E75' }} aria-hidden="true" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#085041' }}>Fully compliant</div>
                <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 1 }}>No overdue obligations</div>
              </div>
            </div>
          )}
          <div style={{ padding: '16px 20px' }}>
            {complianceData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: '#E1F5EE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <i className="ti ti-check" style={{ fontSize: 22, color: '#1D9E75' }} aria-hidden="true" />
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#085041' }}>All clear</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>No obligations to display in the chart.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <PieChart width={80} height={80}>
                    <Pie
                      data={complianceData}
                      cx={35}
                      cy={35}
                      innerRadius={25}
                      outerRadius={38}
                      dataKey="value"
                      strokeWidth={0}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {complianceData.map((entry, i) => (
                        <Cell key={entry.name + String(i)} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
                  {complianceData.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                      <span style={{ fontSize: 10, color: '#6B7280' }}>
                        {d.name} ({d.value})
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            background: 'white',
            border: '0.5px solid #EBEAE6',
            borderRadius: 12,
            overflow: 'hidden',
          }}
          className="shadow-sm"
        >
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '0.5px solid #EBEAE6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Reports</span>
            <Link href={`/portal/funds/${id}/reports`} style={{ fontSize: 12, color: '#1D9E75', fontWeight: 500, textDecoration: 'none' }}>
              Upload →
            </Link>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>Next due</div>
                {nextDue ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginTop: 4 }}>{formatPortalDate(nextDue.due_date.slice(0, 10))}</div>
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 4,
                        color: nextDueDiff != null && nextDueDiff >= 0 && nextDueDiff < 30 ? '#854F0B' : '#6B7280',
                      }}
                    >
                      {formatReportType(nextDue.report_type)} · {nextDueDiff != null ? `${nextDueDiff} days` : '—'}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>—</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>Accepted</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#085041', marginTop: 4 }}>{reportsAccepted}</div>
              </div>
            </div>

            {reportsTotal > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#E5E7EB' }}>
                  {acceptedPct > 0 ? (
                    <div
                      style={{
                        width: `${acceptedPct}%`,
                        background: '#1D9E75',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  ) : null}
                  {overduePct > 0 ? <div style={{ width: `${overduePct}%`, background: '#E24B4A' }} /> : null}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75' }} />
                    <span style={{ fontSize: 10, color: '#6B7280' }}>Accepted ({reportsAccepted})</span>
                  </div>
                  {reportsOverdue > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E24B4A' }} />
                      <span style={{ fontSize: 10, color: '#6B7280' }}>Overdue ({reportsOverdue})</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 10, color: '#0F6E56', fontWeight: 500 }}>✓ All up to date</span>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 16, textAlign: 'center' }}>No obligation breakdown for this chart.</p>
            )}

            <Link
              href={`/portal/funds/${id}/reports`}
              className="flex w-full items-center justify-center rounded-lg font-semibold text-white"
              style={{ marginTop: 16, background: '#00A99D', padding: '10px 16px', fontSize: 13, textDecoration: 'none' }}
            >
              Upload reports →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FundOverviewPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [fund, setFund] = useState<FundData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const linkId = 'tabler-icons-webfont-fund-overview';
    if (typeof document === 'undefined' || document.getElementById(linkId)) return;
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = TABLER_ICONS_CSS;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void fetch(`/api/portal/funds/${id}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        const json = (await r.json()) as FundData & { message?: string; error?: string };
        if (!r.ok) {
          setFund(null);
          setError(json.message ?? json.error ?? 'Could not load fund.');
          return;
        }
        if (json.application == null && json.portfolio_fund == null) {
          setFund(null);
          setError(json.message ?? 'Could not load fund.');
          return;
        }
        setFund(json);
        setError(null);
      })
      .catch(() => {
        setFund(null);
        setError('Could not load fund.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const committed = fund ? isCommittedStage(fund) : false;

  if (!id) return null;
  if (error) return <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  if (loading || !fund) return <PortfolioOverviewSkeleton />;

  if (committed) {
    return <PortfolioOverview fund={fund} id={id} />;
  }

  return <OnboardingOverview fund={fund} id={id} />;
}
