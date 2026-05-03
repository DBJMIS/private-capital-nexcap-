'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { PAGE_SUGGESTED_PROMPTS } from '@/lib/assistant/page-contexts';
import { useAssistant } from '@/contexts/AssistantContext';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

type FundSummary = {
  fund_id: string;
  fund_name: string;
  currency: string;
  dbj_commitment: number;
  total_calls: number;
  total_called: number;
  remaining_commitment: number;
  pct_deployed: number;
  unpaid_calls: number;
  last_call_date: string | null;
  status: 'current' | 'overdue' | 'pending';
};

type RecentCall = {
  id: string;
  fund_id: string;
  fund_name: string;
  notice_number: number;
  date_of_notice: string;
  call_amount: number;
  currency: string;
  status: string;
};

type InvestmentLine = {
  id: string;
  investee_company: string | null;
  amount: number;
  currency: string;
  fund_id?: string;
  fund_name: string;
  date_of_notice: string;
};

function fmtUsd(n: number) {
  return `USD ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Formatted integer amount without currency prefix (Per-Fund Summary monetary columns). */
function fmtAmountDigits(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** $X.XXM style for Called (USD) KPI. */
function fmtDollarMillions(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** $XXXM style for Called (JMD) KPI (whole millions). */
function fmtJmdMillions(n: number) {
  return `$${Math.max(0, Math.round(n / 1_000_000))}M`;
}

function fundRowStatus(s: FundSummary['status']) {
  if (s === 'overdue') return { label: 'Overdue', className: 'bg-red-50 text-red-700' };
  if (s === 'pending') return { label: 'Pending', className: 'bg-amber-50 text-amber-700' };
  return { label: 'Current', className: 'bg-teal-50 text-teal-700' };
}

function pctBarClass(pct: number) {
  if (pct >= 80) return 'bg-[#0F8A6E]';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-[#0B1F45]';
}

function currencyPillClass(currency: string) {
  return currency === 'JMD'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-blue-200 bg-blue-50 text-blue-700';
}

/** Recent-call table: Paid → green, Overdue → red, Pending → amber (unpaid / partial). */
function noticeStatusPill(status: string) {
  const s = status.toLowerCase();
  if (s === 'paid') {
    return {
      label: 'Paid',
      className: 'border border-green-200 bg-green-50 text-green-700',
    };
  }
  if (s === 'overdue') {
    return {
      label: 'Overdue',
      className: 'border border-red-200 bg-red-50 text-red-700',
    };
  }
  if (s === 'unpaid' || s === 'partial') {
    return {
      label: 'Pending',
      className: 'border border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  return {
    label: status.charAt(0).toUpperCase() + status.slice(1),
    className: 'border border-gray-200 bg-gray-100 text-gray-600',
  };
}

export function CapitalCallsOverviewClient() {
  const router = useRouter();
  const { user, role, isLoading: authLoading } = useAuth();
  const { setPageContext } = useAssistant();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [funds, setFunds] = useState<FundSummary[]>([]);
  const [recent, setRecent] = useState<RecentCall[]>([]);
  const [investments, setInvestments] = useState<InvestmentLine[]>([]);
  const [kpi, setKpi] = useState({
    total_called_usd_equiv: 0,
    total_remaining_usd_equiv: 0,
    unpaid_calls_count: 0,
    investments_usd_equiv: 0,
  });

  const callActivity = useMemo(() => {
    const totalNotices = funds.reduce((s, f) => s + f.total_calls, 0);
    const fundsWithCalls = funds.filter((f) => f.total_calls > 0);
    const nFundsWithCalls = fundsWithCalls.length;

    const overdueInRecent = recent.filter((c) => c.status.toLowerCase() === 'overdue');
    const overdueCount = overdueInRecent.length;
    let overdueSub = '—';
    if (overdueInRecent.length > 0) {
      const first = overdueInRecent[0]!;
      overdueSub = `${first.fund_name} · Notice ${first.notice_number}`;
      if (overdueInRecent.length > 1) {
        overdueSub += ` (+${overdueInRecent.length - 1} more)`;
      }
    }

    const usdFunds = funds.filter((f) => f.currency === 'USD');
    const jmdFunds = funds.filter((f) => f.currency === 'JMD');
    const calledUsdSum = usdFunds.reduce((s, f) => s + f.total_called, 0);
    const calledJmdSum = jmdFunds.reduce((s, f) => s + f.total_called, 0);
    const usdNames =
      usdFunds
        .filter((f) => f.total_calls > 0)
        .map((f) => f.fund_name)
        .join(', ') || '—';
    const jmdNames =
      jmdFunds
        .filter((f) => f.total_calls > 0)
        .map((f) => f.fund_name)
        .join(', ') || '—';

    return {
      totalNotices,
      nFundsWithCalls,
      overdueCount,
      overdueSub,
      calledUsdSum,
      calledJmdSum,
      usdNames,
      jmdNames,
      fundsWithCalls,
    };
  }, [funds, recent]);

  useEffect(() => {
    if (authLoading || !user?.user_id || !role) return;
    if (loading) return;
    if (err) {
      setPageContext(null);
      return;
    }
    const callCount = funds.reduce((s, f) => s + f.total_calls, 0);
    const overdueCount = recent.filter((c) => c.status.toLowerCase() === 'overdue').length;
    setPageContext({
      pageId: 'capital-calls',
      pageTitle: 'Capital Calls',
      userRole: role,
      userId: user.user_id,
      data: {
        totalCalled: kpi.total_called_usd_equiv,
        totalOutstanding: kpi.total_remaining_usd_equiv,
        callCount,
        overdueCount,
        unpaidCallsCount: kpi.unpaid_calls_count,
        calls: recent.map((c) => ({
          fundName: c.fund_name,
          callNumber: c.notice_number,
          amount: c.call_amount,
          dueDate: c.date_of_notice,
          status: c.status,
          paidDate: null,
        })),
        note: 'Recent notices list shows the latest 10 notices across the portfolio (not the full history). Amounts may be in fund native currency; headline KPIs are USD equivalent.',
      },
      suggestedPrompts: PAGE_SUGGESTED_PROMPTS['capital-calls'],
    });
    return () => setPageContext(null);
  }, [authLoading, err, funds, kpi, loading, recent, role, setPageContext, user?.user_id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch('/api/portfolio/capital-calls/summary');
        const j = (await res.json()) as {
          funds?: FundSummary[];
          recent_calls?: RecentCall[];
          investment_line_items?: InvestmentLine[];
          kpi?: typeof kpi;
          error?: string;
        };
        if (!res.ok) throw new Error(j.error ?? 'Failed');
        if (cancelled) return;
        setFunds(j.funds ?? []);
        setRecent(j.recent_calls ?? []);
        setInvestments(j.investment_line_items ?? []);
        if (j.kpi) setKpi(j.kpi);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div>
        <h1 className="text-2xl font-bold text-[#0B1F45]">Capital Calls</h1>
        <p className="mt-1 text-sm text-gray-400">DBJ capital call notices across all active funds</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0B1F45] bg-white p-5">
          <p className="text-2xl font-bold text-[#0B1F45]">{fmtUsd(kpi.total_called_usd_equiv)}</p>
          <p className="mt-1 text-sm text-gray-600">Total Called (USD equiv.)</p>
          <p className="mt-2 text-xs text-gray-400">Across all active funds</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-amber-500 bg-white p-5">
          <p className="text-2xl font-bold text-[#0B1F45]">{fmtUsd(kpi.total_remaining_usd_equiv)}</p>
          <p className="mt-1 text-sm text-gray-600">Remaining Commitment</p>
          <p className="mt-2 text-xs text-gray-400">Yet to be called</p>
        </div>
        <div
          className={cn(
            'relative overflow-hidden rounded-xl border border-gray-200 border-t-4 bg-white p-5',
            kpi.unpaid_calls_count > 0 ? 'border-t-red-500' : 'border-t-gray-300',
          )}
        >
          <p className="text-2xl font-bold text-[#0B1F45]">{kpi.unpaid_calls_count}</p>
          <p className="mt-1 text-sm text-gray-600">Unpaid Calls</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-gray-200 border-t-4 border-t-[#0F8A6E] bg-white p-5">
          <p className="text-2xl font-bold text-[#0B1F45]">{fmtUsd(kpi.investments_usd_equiv)}</p>
          <p className="mt-1 text-sm text-gray-600">Invested in Companies</p>
          <p className="mt-2 text-xs text-gray-400">Excluding fees</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-5 py-4 text-base font-semibold text-[#0B1F45]">Per-Fund Summary</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-100 bg-white text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">Fund</th>
                <th className="px-5 py-3">Currency</th>
                <th className="px-5 py-3">Commitment</th>
                <th className="px-5 py-3">Called</th>
                <th className="px-5 py-3">Remaining</th>
                <th className="px-5 py-3">% Deployed</th>
                <th className="px-5 py-3">Calls</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {funds.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-500">
                    No active funds.
                  </td>
                </tr>
              ) : (
                funds.map((f) => {
                  const st = fundRowStatus(f.status);
                  return (
                    <tr
                      key={f.fund_id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer hover:bg-gray-50/80"
                      onClick={() => router.push(`/portfolio/funds/${f.fund_id}?tab=calls`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/portfolio/funds/${f.fund_id}?tab=calls`);
                        }
                      }}
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-[#0B1F45]">{f.fund_name}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                            f.currency === 'JMD'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-blue-200 bg-blue-50 text-blue-700',
                          )}
                        >
                          {f.currency}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-800">{fmtAmountDigits(f.dbj_commitment)}</td>
                      <td className="px-5 py-3 text-gray-800">{fmtAmountDigits(f.total_called)}</td>
                      <td className="px-5 py-3 text-gray-800">{fmtAmountDigits(f.remaining_commitment)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 min-w-[72px] flex-1 rounded-full bg-gray-100">
                            <div className={cn('h-2 rounded-full', pctBarClass(f.pct_deployed))} style={{ width: `${Math.min(100, f.pct_deployed)}%` }} />
                          </div>
                          <span className="shrink-0 text-xs font-medium text-gray-600">{f.pct_deployed}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-800">{f.total_calls}</td>
                      <td className="px-5 py-3">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', st.className)}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-200 px-5 py-4 text-base font-semibold text-[#0B1F45]">Recent Capital Calls</h2>
          <div className="overflow-x-auto px-5 pb-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="pb-2 pr-3">Notice</th>
                  <th className="pb-2 pr-3">Fund</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3 text-right">Currency</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No calls yet.
                    </td>
                  </tr>
                ) : (
                  recent.map((c, idx) => {
                    const st = noticeStatusPill(c.status);
                    const isLast = idx === recent.length - 1;
                    return (
                      <tr key={c.id} className={cn('border-b border-gray-100', isLast && 'border-b-0')}>
                        <td className="py-2.5 pr-3 align-middle font-medium text-[#0B1F45]">Notice {c.notice_number}</td>
                        <td className="py-2.5 pr-3 align-middle text-sm text-gray-500">{c.fund_name}</td>
                        <td className="py-2.5 pr-3 align-middle text-sm text-gray-500">{fmtDate(c.date_of_notice)}</td>
                        <td className="py-2.5 pr-3 text-right align-middle font-medium text-gray-900">{fmtAmountDigits(c.call_amount)}</td>
                        <td className="py-2.5 pr-3 text-right align-middle">
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              currencyPillClass(c.currency),
                            )}
                          >
                            {c.currency}
                          </span>
                        </td>
                        <td className="py-2.5 text-right align-middle">
                          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', st.className)}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-200 px-5 py-4 text-base font-semibold text-[#0B1F45]">Portfolio Investments</h2>
            <div className="px-5 pb-4">
              {investments.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">No investment line items.</p>
              ) : (
                <ul>
                  {investments.map((inv, idx) => {
                    const isLast = idx === investments.length - 1;
                    return (
                      <li
                        key={inv.id}
                        className={cn(
                          'flex items-start justify-between gap-3 border-b border-gray-100 py-2.5',
                          isLast && 'border-b-0',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0B1F45]">{inv.investee_company ?? '—'}</p>
                          <p className="text-xs text-gray-400">{inv.fund_name}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-sm font-medium text-gray-900">{fmtAmountDigits(inv.amount)}</span>
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                currencyPillClass(inv.currency),
                              )}
                            >
                              {inv.currency}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-400">{inv.date_of_notice ? fmtDate(inv.date_of_notice) : '—'}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-200 px-5 py-4 text-base font-semibold text-[#0B1F45]">Call Activity Summary</h2>
            <div className="px-5 pb-4">
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-400">Total Notices</p>
                  <p className="text-lg font-medium text-gray-900">{callActivity.totalNotices}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Across {callActivity.nFundsWithCalls} fund{callActivity.nFundsWithCalls === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-400">Overdue</p>
                  <p className="text-lg font-medium text-red-600">{callActivity.overdueCount}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-400" title={callActivity.overdueSub}>
                    {callActivity.overdueSub}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-400">Called (USD)</p>
                  <p className="text-lg font-medium text-gray-900">{fmtDollarMillions(callActivity.calledUsdSum)}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{callActivity.usdNames}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-400">Called (JMD)</p>
                  <p className="text-lg font-medium text-gray-900">{fmtJmdMillions(callActivity.calledJmdSum)}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{callActivity.jmdNames}</p>
                </div>
              </div>

              <div className="mt-1 border-t border-gray-100 pt-3">
                <p className="mb-2 text-xs font-medium text-gray-400">Per-fund breakdown</p>
                {callActivity.fundsWithCalls.length === 0 ? (
                  <p className="text-xs text-gray-500">No calls recorded.</p>
                ) : (
                  <ul>
                    {callActivity.fundsWithCalls.map((f, idx) => {
                      const isLast = idx === callActivity.fundsWithCalls.length - 1;
                      return (
                        <li
                          key={f.fund_id}
                          className={cn(
                            'flex items-center justify-between gap-2 border-b border-gray-100 py-2.5',
                            isLast && 'border-b-0',
                          )}
                        >
                          <span className="text-sm font-medium text-gray-900">{f.fund_name}</span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                            <span>
                              {f.total_calls} call{f.total_calls === 1 ? '' : 's'}
                            </span>
                            <span>·</span>
                            <span>{fmtAmountDigits(f.total_called)}</span>
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                currencyPillClass(f.currency),
                              )}
                            >
                              {f.currency}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
