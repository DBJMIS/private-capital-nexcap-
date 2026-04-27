import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowDownLeft, Building2, DollarSign, TrendingUp } from 'lucide-react';

import { ExecutiveAllocationPie, ExecutiveCapitalFlowCharts, ExecutiveComplianceDonut } from '@/components/portfolio/ExecutiveViewCharts';
import { ExecutiveExportPdfButton } from '@/components/portfolio/ExecutiveExportPdfButton';
import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  buildExecutiveView,
  fmtUsdShort,
  REPORT_TYPE_LABELS_EXEC,
  type ExecCapitalCallRow,
  type ExecDistributionRow,
  type ExecFundRow,
  type ExecutiveLatestAssessment,
} from '@/lib/portfolio/executive-view';
import type { VcFundSnapshot, VcQuarterlyAssessment } from '@/types/database';
import { fundCategoryBadgeClassName, fundCategoryLabel } from '@/lib/portfolio/fund-category';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Executive View',
};

export const dynamic = 'force-dynamic';

function fmtDue(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function complianceCompact(status: string) {
  if (status === 'fully_compliant') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
        ✓ Compliant
      </span>
    );
  }
  if (status === 'audits_outstanding') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
        Audits ⚠
      </span>
    );
  }
  if (status === 'reports_outstanding') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
        Reports ⚠
      </span>
    );
  }
  if (status === 'non_compliant') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
        Non-Compliant
      </span>
    );
  }
  if (status === 'partially_compliant') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden />
        Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" aria-hidden />
      —
    </span>
  );
}

function daysTone(days: number) {
  if (days > 365) return 'text-red-700 font-bold';
  if (days > 90) return 'text-red-600 font-semibold';
  if (days > 30) return 'text-amber-600';
  return 'text-gray-600';
}

export default async function PortfolioExecutivePage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const tenantId = profile.tenant_id;
  const supabase = createServerClient();

  const [fundsRes, callsRes, distRes, snapsRes, assessRes] = await Promise.all([
    supabase
      .from('vc_portfolio_funds')
      .select(
        `
        *,
        vc_reporting_obligations (
          id,
          status,
          report_type,
          due_date,
          period_label,
          days_overdue
        )
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('fund_status', 'active')
      .order('fund_name'),
    supabase
      .from('vc_capital_calls')
      .select(
        `
        id,
        fund_id,
        call_amount,
        currency,
        status,
        date_of_notice,
        notice_number,
        total_called_to_date,
        vc_capital_call_items (
          id,
          purpose_category,
          amount,
          investee_company,
          description,
          currency
        )
      `,
      )
      .eq('tenant_id', tenantId),
    supabase.from('vc_distributions').select('fund_id, distribution_date, amount, currency').eq('tenant_id', tenantId).order('distribution_date', { ascending: true }),
    supabase.from('vc_fund_snapshots').select('*').eq('tenant_id', tenantId),
    supabase
      .from('vc_quarterly_assessments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false }),
  ]);

  if (fundsRes.error) {
    return <p className="text-sm text-red-700">Error loading funds: {fundsRes.error.message}</p>;
  }
  if (callsRes.error) {
    return <p className="text-sm text-red-700">Error loading capital calls: {callsRes.error.message}</p>;
  }
  if (distRes.error) {
    return <p className="text-sm text-red-700">Error loading distributions: {distRes.error.message}</p>;
  }
  if (snapsRes.error) {
    return <p className="text-sm text-red-700">Error loading fund snapshots: {snapsRes.error.message}</p>;
  }
  if (assessRes.error) {
    return <p className="text-sm text-red-700">Error loading assessments: {assessRes.error.message}</p>;
  }

  const latestApprovedByFund: Record<string, ExecutiveLatestAssessment> = {};
  for (const raw of (assessRes.data ?? []) as VcQuarterlyAssessment[]) {
    if (!latestApprovedByFund[raw.fund_id]) {
      latestApprovedByFund[raw.fund_id] = {
        weighted_total_score: raw.weighted_total_score != null ? Number(raw.weighted_total_score) : null,
        category: raw.category,
        divestment_recommendation: raw.divestment_recommendation,
      };
    }
  }

  const model = buildExecutiveView(
    fundsRes.data as ExecFundRow[] | null,
    callsRes.data as ExecCapitalCallRow[] | null,
    distRes.data as ExecDistributionRow[] | null,
    (snapsRes.data ?? []) as VcFundSnapshot[],
    latestApprovedByFund,
  );

  const asAt = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const {
    funds,
    summary,
    totals,
    topOverdue,
    investments,
    fees_usd,
    investments_usd,
    compliance_counts,
    charts,
    fundNotes,
    performance_summary,
  } = model;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              .page-break { page-break-before: always; }
              body { font-size: 11pt; }
            }
          `,
        }}
      />

      <div className="w-full space-y-10 bg-[#F3F4F6] pb-16 pt-2 print:bg-white print:pb-8">
        <header className="flex flex-col gap-6 border-b border-gray-200 bg-white px-1 py-6 sm:flex-row sm:items-start sm:justify-between print:border-gray-300">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#0B1F45] text-sm font-bold text-white">DBJ</div>
            <div>
              <h1 className="text-2xl font-bold text-[#0B1F45]">Portfolio Executive Summary</h1>
              <p className="mt-1 max-w-xl text-sm text-gray-400">
                Development Bank of Jamaica — Private Capital &amp; Fund Management
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-sm text-gray-500">As at {asAt}</p>
            <ExecutiveExportPdfButton />
          </div>
        </header>

        {/* Section 1 */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Portfolio at a Glance</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<Building2 className="mb-2 h-6 w-6 text-[#0B1F45]" aria-hidden />}
              value={String(summary.active_funds)}
              label="Active Funds"
              sub="Under DBJ management"
            />
            <SummaryCard
              icon={<DollarSign className="mb-2 h-6 w-6 text-[#0B1F45]" aria-hidden />}
              value={summary.total_committed_usd}
              label="Total Committed"
              sub="DBJ equity commitment (USD equivalent)"
            />
            <SummaryCard
              icon={<TrendingUp className="mb-2 h-6 w-6 text-[#0B1F45]" aria-hidden />}
              value={summary.total_called_usd}
              label="Total Called"
              sub={`${summary.pct_called_of_commitment}% of commitment`}
            />
            <SummaryCard
              icon={<ArrowDownLeft className="mb-2 h-6 w-6 text-[#0F8A6E]" aria-hidden />}
              value={summary.total_returned_usd}
              label="Total Returned"
              sub={
                summary.yield_on_commitment_pct != null
                  ? `${summary.yield_on_commitment_pct}% yield on commitment`
                  : '—'
              }
            />
          </div>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Fund Portfolio</h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0B1F45] text-left text-white">
                  <tr>
                    {[
                      'Fund',
                      'Category',
                      'Manager',
                      'CCY',
                      'Committed',
                      'Called',
                      '% Called',
                      'Returned',
                      'Yield',
                      'Compliance',
                      'Overdue',
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-white/80">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {funds.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-gray-500">
                        No active funds.
                      </td>
                    </tr>
                  ) : (
                    funds.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 print:hover:bg-transparent">
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#0B1F45]">{r.fund_name}</p>
                          {r.listed ? (
                            <span className="mt-1 inline-block rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              Listed
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={fundCategoryBadgeClassName(r.fund_category)}>{fundCategoryLabel(r.fund_category)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.manager_name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              r.currency === 'JMD'
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-blue-200 bg-blue-50 text-blue-700',
                            )}
                          >
                            {r.currency}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800">{r.committed_display}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.called_display}</td>
                        <td className="px-4 py-3">
                          <div className="flex max-w-[120px] flex-col gap-1">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full bg-[#0B1F45]"
                                style={{ width: `${Math.min(100, r.pct_called)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600">{r.pct_called}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-[#0F8A6E]">{r.returned_display}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {r.yield_pct != null ? `${r.yield_pct}%` : '—'}
                        </td>
                        <td className="px-4 py-3">{complianceCompact(r.compliance_status)}</td>
                        <td className="px-4 py-3">
                          {r.overdue_count > 0 ? (
                            <span className="font-medium text-red-600">{r.overdue_count}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                  {funds.length > 0 ? (
                    <tr className="bg-gray-50 font-semibold text-gray-900 print:bg-gray-100">
                      <td className="px-4 py-3" colSpan={4}>
                        Totals
                      </td>
                      <td className="px-4 py-3">{fmtUsdShort(totals.committed_usd)}</td>
                      <td className="px-4 py-3">{fmtUsdShort(totals.called_usd)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs">{totals.pct_called}%</span>
                      </td>
                      <td className="px-4 py-3 text-[#0F8A6E]">{fmtUsdShort(totals.returned_usd)}</td>
                      <td className="px-4 py-3">{totals.yield_pct != null ? `${totals.yield_pct}%` : '—'}</td>
                      <td className="px-4 py-3 text-xs font-normal text-gray-600">
                        {totals.compliant_count} compliant / {totals.fund_count}
                      </td>
                      <td className="px-4 py-3 text-red-600">{totals.total_overdue}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Fund performance (latest quarterly snapshot per fund) */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Fund performance summary</h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0B1F45] text-left text-white">
                  <tr>
                    {['Fund', 'DPI', 'TVPI', 'Calc. IRR', 'Reported IRR', 'Assessment', 'Recommendation'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-white/80">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {performance_summary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        No funds.
                      </td>
                    </tr>
                  ) : (
                    performance_summary.map((r) => (
                      <tr key={r.fund_id} className="hover:bg-gray-50 print:hover:bg-transparent">
                        <td className="px-4 py-3 font-medium text-[#0B1F45]">{r.fund_name}</td>
                        <td className="px-4 py-3 text-gray-800">{r.dpi}</td>
                        <td className="px-4 py-3 text-gray-800">{r.tvpi}</td>
                        <td className="px-4 py-3 text-gray-800">{r.calculated_irr}</td>
                        <td className="px-4 py-3 text-gray-800">{r.reported_irr}</td>
                        <td className="px-4 py-3 text-xs text-gray-800">{r.assessment_display}</td>
                        <td className="px-4 py-3 text-xs capitalize text-gray-800">{r.recommendation_display}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
              DPI / TVPI / IRR are computed from cumulative calls and distributions through each fund&apos;s latest snapshot date
              (PCV funds: DPI only).
            </p>
          </div>
        </section>

        {/* Section 3 */}
        <section className="page-break">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Capital Flow Summary</h2>
          <ExecutiveCapitalFlowCharts charts={charts} />
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Compliance Status</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-1">
              <ExecutiveComplianceDonut compliancePie={charts.compliancePie} fundCount={totals.fund_count} />
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
                <ul className="space-y-2">
                  <li className="flex justify-between text-teal-800">
                    <span>Fully Compliant</span>
                    <span className="font-semibold">{compliance_counts.fully}</span>
                  </li>
                  <li className="flex justify-between text-amber-800">
                    <span>Audits Outstanding</span>
                    <span className="font-semibold">{compliance_counts.audits}</span>
                  </li>
                  <li className="flex justify-between text-amber-800">
                    <span>Reports Outstanding</span>
                    <span className="font-semibold">{compliance_counts.reports}</span>
                  </li>
                  {compliance_counts.partial > 0 ? (
                    <li className="flex justify-between text-blue-800">
                      <span>In Progress</span>
                      <span className="font-semibold">{compliance_counts.partial}</span>
                    </li>
                  ) : null}
                  <li className="flex justify-between text-red-600">
                    <span>Total Overdue</span>
                    <span className="font-semibold">{totals.total_overdue}</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white lg:col-span-2">
              <div className="border-b border-gray-200 px-5 py-3">
                <h3 className="text-sm font-semibold text-[#0B1F45]">Top Overdue Items</h3>
                <p className="text-xs text-gray-400">Most pressing reporting gaps</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-gray-100 bg-white text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Fund</th>
                      <th className="px-4 py-2">Period</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Due Date</th>
                      <th className="px-4 py-2">Days Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topOverdue.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                          No overdue obligations.
                        </td>
                      </tr>
                    ) : (
                      topOverdue.map((o, i) => (
                        <tr key={`${o.fund_name}-${o.period_label}-${i}`}>
                          <td className="px-4 py-2 font-medium text-[#0B1F45]">{o.fund_name}</td>
                          <td className="px-4 py-2 text-xs text-gray-600">{o.period_label}</td>
                          <td className="px-4 py-2 text-xs">
                            {REPORT_TYPE_LABELS_EXEC[o.report_type] ?? o.report_type}
                          </td>
                          <td className="px-4 py-2 text-sm text-red-600">{fmtDue(o.due_date)}</td>
                          <td className={cn('px-4 py-2 text-sm', daysTone(o.days_overdue))}>
                            {o.days_overdue} days
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Portfolio Investment Activity</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-[#0B1F45]">Portfolio Companies</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Company</th>
                      <th className="px-4 py-2">Fund</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">CCY</th>
                      <th className="px-4 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {investments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                          No investment line items.
                        </td>
                      </tr>
                    ) : (
                      investments.map((inv) => (
                        <tr key={inv.id}>
                          <td className="px-4 py-2 font-medium text-[#0B1F45]">{inv.company}</td>
                          <td className="px-4 py-2 text-xs text-gray-400">{inv.fund_name}</td>
                          <td className="px-4 py-2">{inv.amount_display}</td>
                          <td className="px-4 py-2">
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                inv.currency === 'JMD'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-blue-200 bg-blue-50 text-blue-700',
                              )}
                            >
                              {inv.currency}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-400">{fmtDue(inv.date)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <ExecutiveAllocationPie
                allocationPie={charts.allocationPie}
                allocationCenterPctOfCalled={charts.allocationCenterPctOfCalled}
              />
              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm">
                <div className="flex justify-between border-b border-gray-100 py-2 text-gray-600">
                  <span>Total in Fees</span>
                  <span className="font-medium text-gray-900">{fmtUsdShort(fees_usd)}</span>
                </div>
                <div className="flex justify-between py-2 text-gray-600">
                  <span>Total in Investments</span>
                  <span className="font-medium text-[#0B1F45]">{fmtUsdShort(investments_usd)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6 — print included */}
        {fundNotes.length > 0 ? (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Fund Manager Notes</h2>
            <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6">
              {fundNotes.map((fn) => (
                <div key={fn.fund_name}>
                  <h3 className="text-sm font-semibold text-[#0B1F45]">{fn.fund_name}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{fn.notes}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function SummaryCard({
  icon,
  value,
  label,
  sub,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {icon}
      <p className="text-4xl font-bold text-[#0B1F45]">{value}</p>
      <p className="mt-1 text-sm font-medium text-gray-700">{label}</p>
      <p className="mt-2 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
