'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';

import { AddFundManuallyButton } from '@/components/portfolio/AddFundManuallyButton';
import { deriveComplianceStatus } from '@/lib/portfolio/compliance-fund-rows';
import type { ObligationLite } from '@/lib/portfolio/compliance';
import {
  FUND_CATEGORY_FILTER_OPTIONS,
  FUND_CATEGORY_GROUP_ORDER,
  fundCategoryBadgeClassName,
  fundCategoryLabel,
  type FundCategoryValue,
} from '@/lib/portfolio/fund-category';
import { formatMetricRatio } from '@/lib/portfolio/fund-performance-metrics';
import type { PortfolioFundRowWithMonitorMetrics } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function fmtMoney(currency: string, n: number) {
  const cur = currency === 'JMD' ? 'JMD' : 'USD';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${cur} ${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${cur} ${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${cur} ${(n / 1e3).toFixed(1)}K`;
  return `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function badgeClass(tone: 'teal' | 'amber' | 'red' | 'gray') {
  if (tone === 'teal') return 'bg-emerald-50 text-[#0F8A6E] border border-emerald-200';
  if (tone === 'amber') return 'bg-amber-50 text-amber-900 border border-amber-200';
  if (tone === 'red') return 'bg-red-50 text-red-800 border border-red-200';
  return 'bg-[#EEF3FB] text-gray-600 border border-[#D0DBED]';
}

function fundComplianceTone(obs: ObligationLite[]): 'teal' | 'amber' | 'red' | 'gray' {
  const st = deriveComplianceStatus(obs);
  if (st === 'fully_compliant') return 'teal';
  if (st === 'no_data') return 'gray';
  if (st === 'audits_outstanding' || st === 'reports_outstanding') return 'amber';
  if (st === 'non_compliant') return 'red';
  return 'amber';
}

function fundComplianceLabel(obs: ObligationLite[]): string {
  const st = deriveComplianceStatus(
    obs.map((o) => ({
      id: '',
      status: o.status,
      report_type: o.report_type,
      due_date: o.due_date,
      period_label: '',
    })),
  );
  if (st === 'fully_compliant') return 'Fully compliant';
  if (st === 'no_data') return 'No data yet';
  if (st === 'audits_outstanding') return 'Audits outstanding';
  if (st === 'reports_outstanding') return 'Reports outstanding';
  if (st === 'non_compliant') return 'Non-compliant';
  return 'In progress';
}

type Props = {
  funds: PortfolioFundRowWithMonitorMetrics[];
  obligationEntries: [string, ObligationLite[]][];
  canAddFund: boolean;
  totalUsd: number;
  fullyCompliant: number;
  attentionCount: number;
};

export function FundMonitoringClient({
  funds,
  obligationEntries,
  canAddFund,
  totalUsd,
  fullyCompliant,
  attentionCount,
}: Props) {
  const [search, setSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | 'USD' | 'JMD'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'compliant' | 'issues'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | FundCategoryValue>('all');

  const obsMap = useMemo(() => new Map(obligationEntries), [obligationEntries]);

  const jmdCount = useMemo(() => funds.filter((f) => f.currency === 'JMD').length, [funds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return funds.filter((f) => {
      if (q && !f.fund_name.toLowerCase().includes(q) && !f.manager_name.toLowerCase().includes(q)) return false;
      if (currencyFilter !== 'all' && f.currency !== currencyFilter) return false;
      if (statusFilter === 'active' && f.fund_status !== 'active') return false;
      if (statusFilter === 'closed' && f.fund_status !== 'closed') return false;
      if (categoryFilter !== 'all' && (f.fund_category ?? '') !== categoryFilter) return false;
      const obs = obsMap.get(f.id) ?? [];
      const st = deriveComplianceStatus(obs);
      if (complianceFilter === 'compliant' && st !== 'fully_compliant') return false;
      if (complianceFilter === 'issues' && (st === 'fully_compliant' || st === 'no_data')) return false;
      return true;
    });
  }, [funds, search, currencyFilter, statusFilter, complianceFilter, categoryFilter, obsMap]);

  const groupedForTable = useMemo(() => {
    const sortByName = (a: PortfolioFundRowWithMonitorMetrics, b: PortfolioFundRowWithMonitorMetrics) =>
      a.fund_name.localeCompare(b.fund_name);
    if (categoryFilter !== 'all') {
      return [{ key: categoryFilter, showHeading: false, funds: [...filtered].sort(sortByName) }];
    }
    const buckets = new Map<string, PortfolioFundRowWithMonitorMetrics[]>();
    for (const f of filtered) {
      const k = f.fund_category ?? '__uncat__';
      const list = buckets.get(k) ?? [];
      list.push(f);
      buckets.set(k, list);
    }
    const used = new Set<string>();
    const out: { key: string; showHeading: boolean; funds: PortfolioFundRowWithMonitorMetrics[] }[] = [];
    for (const key of FUND_CATEGORY_GROUP_ORDER) {
      const raw = buckets.get(key);
      if (!raw?.length) continue;
      used.add(key);
      out.push({ key, showHeading: true, funds: [...raw].sort(sortByName) });
    }
    for (const [key, raw] of buckets) {
      if (used.has(key) || !raw.length) continue;
      out.push({ key, showHeading: true, funds: [...raw].sort(sortByName) });
    }
    return out;
  }, [filtered, categoryFilter]);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F45] sm:text-3xl">Fund Monitoring</h1>
          <p className="mt-1 text-sm text-gray-500">
            {funds.length} active fund{funds.length === 1 ? '' : 's'} under DBJ management
          </p>
        </div>
        {canAddFund ? <AddFundManuallyButton /> : null}
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-white p-5 pt-6 shadow-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-blue-500" />
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-500/80">
            <Building2 className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-3xl font-bold text-[#0B1F45]">{funds.length}</p>
          <p className="mt-1 text-sm text-gray-500">Total Active Funds</p>
          <p className="mt-2 text-xs text-gray-400">Under monitoring</p>
        </div>
        <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-white p-5 pt-6 shadow-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-[#0B1F45]" />
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#0B1F45]/10 text-[#0B1F45]/70">
            <span className="text-xs font-bold">$</span>
          </div>
          <p className="text-3xl font-bold text-[#0B1F45]">USD {Math.round(totalUsd).toLocaleString()}</p>
          <p className="mt-1 text-sm text-gray-500">Total USD Committed</p>
          <p className="mt-2 text-xs text-gray-400">JMD converted using stored BOJ rate</p>
        </div>
        <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-amber-50/30 p-5 pt-6 shadow-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-[#C8973A]" />
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-700/80">
            <Building2 className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-3xl font-bold text-[#0B1F45]">{jmdCount}</p>
          <p className="mt-1 text-sm text-gray-500">JMD Funds</p>
          <p className="mt-2 text-xs text-gray-400">By currency</p>
        </div>
        <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-red-50/30 p-5 pt-6 shadow-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-red-500" />
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15 text-red-600/80">
            <span className="text-xs font-bold">!</span>
          </div>
          <p className="text-3xl font-bold text-[#0B1F45]">{attentionCount}</p>
          <p className="mt-1 text-sm text-gray-500">Attention Required</p>
          <p className="mt-2 text-xs text-gray-400">{attentionCount} fund{attentionCount === 1 ? '' : 's'} with open issues</p>
        </div>
      </div>

      {funds.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <Building2 className="h-12 w-12 text-[#0B1F45]/25" />
          <h2 className="mt-4 text-lg font-semibold text-[#0B1F45]">No active funds yet</h2>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Funds appear here when a commitment is issued in the selection pipeline.
          </p>
          <Link
            href="/fund-applications"
            className="mt-6 text-sm font-semibold text-[#0F8A6E] underline-offset-2 hover:underline"
          >
            View Pipeline →
          </Link>
        </div>
      ) : (
        <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              placeholder="Search fund or manager…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full max-w-md rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#0B1F45] placeholder:text-gray-400 focus:border-[#0B1F45] focus:outline-none focus:ring-1 focus:ring-[#0B1F45]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700"
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value as typeof currencyFilter)}
              >
                <option value="all">All currencies</option>
                <option value="USD">USD</option>
                <option value="JMD">JMD</option>
              </select>
              <select
                className="h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
              <select
                className="h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700"
                value={complianceFilter}
                onChange={(e) => setComplianceFilter(e.target.value as typeof complianceFilter)}
              >
                <option value="all">All compliance</option>
                <option value="compliant">Compliant</option>
                <option value="issues">Issues</option>
              </select>
              <select
                className="h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
              >
                {FUND_CATEGORY_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-white text-left text-[10px] font-semibold uppercase leading-none tracking-wide text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5">Fund</th>
                  <th className="whitespace-nowrap px-4 py-2.5">Currency</th>
                  <th className="whitespace-nowrap px-4 py-2.5">DBJ Commitment</th>
                  <th className="whitespace-nowrap px-4 py-2.5">Pro-Rata</th>
                  <th className="whitespace-nowrap px-4 py-2.5">Year End</th>
                  <th className="whitespace-nowrap px-4 py-2.5">Compliance</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">DPI</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">TVPI</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              {filtered.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                      No funds match the current filters.
                    </td>
                  </tr>
                </tbody>
              ) : (
                groupedForTable.map((group) => (
                  <tbody key={group.key} className="divide-y divide-gray-100">
                    {group.showHeading ? (
                      <tr className="bg-gray-50">
                        <td
                          colSpan={9}
                          className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                        >
                          {group.key === '__uncat__'
                            ? 'Uncategorised'
                            : (FUND_CATEGORY_FILTER_OPTIONS.find((o) => o.value === group.key)?.label ??
                              fundCategoryLabel(group.key))}
                        </td>
                      </tr>
                    ) : null}
                    {group.funds.map((f) => {
                      const obs = obsMap.get(f.id) ?? [];
                      const tone = fundComplianceTone(obs);
                      const label = fundComplianceLabel(obs);
                      return (
                        <tr key={f.id} className="hover:bg-[#F8F9FF]">
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-[#0B1F45]">{f.fund_name}</p>
                              {f.is_pvc ? (
                                <span className="inline-flex shrink-0 rounded-full bg-[#0B1F45] px-2 py-0.5 text-[10px] font-medium text-white">
                                  PCV
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-gray-400">{f.manager_name}</p>
                            <span className={fundCategoryBadgeClassName(f.fund_category, { withMarginTop: true })}>
                              {fundCategoryLabel(f.fund_category)}
                            </span>
                            {f.listed ? (
                              <span className="mt-1 inline-flex whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                                Listed
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
                                f.currency === 'JMD'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-blue-200 bg-blue-50 text-blue-700',
                              )}
                            >
                              {f.currency}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{fmtMoney(f.currency, Number(f.dbj_commitment))}</td>
                          <td className="px-4 py-3 text-gray-600">{Number(f.dbj_pro_rata_pct).toFixed(2)}%</td>
                          <td className="px-4 py-3 text-gray-600">{MONTH_LONG[f.year_end_month - 1] ?? f.year_end_month}</td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', badgeClass(tone))}>
                              {label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-800">
                            {f.dpi != null ? formatMetricRatio(f.dpi) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-800">
                            {f.tvpi != null ? formatMetricRatio(f.tvpi) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/portfolio/funds/${f.id}`}
                              className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:border-[#0B1F45] hover:text-[#0B1F45]"
                            >
                              View →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
