'use client';

import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { CapitalTimeline } from '@/components/reports/CapitalTimeline';
import { CriteriaRadar } from '@/components/reports/CriteriaRadar';
import { KPICard } from '@/components/reports/KPICard';
import { PipelineFunnel } from '@/components/reports/PipelineFunnel';
import type { AssessmentAnalytics, CapitalSummary, CriteriaBreakdownRow, FunnelStage, KpiBundle, PortfolioSummary } from '@/lib/reports/queries';
import type { ReportRangePreset } from '@/lib/reports/filters';

const GOLD = '#c8973a';
const TEAL = '#0f8a6e';
const RISK_COLORS = {
  performing: '#16a34a',
  watch: '#eab308',
  underperforming: '#ea580c',
  critical: '#dc2626',
} as const;

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export type ExecutiveReportsDashboardProps = {
  filter: { range: ReportRangePreset; sector: string | null; geography: string | null };
  sectors: string[];
  geographies: string[];
  kpis: KpiBundle;
  funnel: FunnelStage[];
  capital: CapitalSummary;
  portfolio: PortfolioSummary;
  assessment: AssessmentAnalytics;
  criteria: CriteriaBreakdownRow[];
};

function buildQuery(next: Partial<{ range: string; sector: string; geography: string }>) {
  const p = new URLSearchParams();
  if (next.range) p.set('range', next.range);
  if (next.sector && next.sector !== 'all') p.set('sector', next.sector);
  if (next.geography && next.geography !== 'all') p.set('geography', next.geography);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function ExecutiveReportsDashboard(props: ExecutiveReportsDashboardProps) {
  const router = useRouter();
  const { filter, sectors, geographies, kpis, funnel, capital, portfolio, assessment, criteria } = props;

  function navigate(partial: Partial<{ range: string; sector: string; geography: string }>) {
    const range = partial.range ?? filter.range;
    const sector = partial.sector !== undefined ? partial.sector : filter.sector ?? 'all';
    const geography = partial.geography !== undefined ? partial.geography : filter.geography ?? 'all';
    router.push(`/reports${buildQuery({ range, sector, geography })}`);
  }

  const riskPie = (
    [
      { name: 'Performing', key: 'performing' as const, value: portfolio.performing },
      { name: 'Watch', key: 'watch' as const, value: portfolio.watch },
      { name: 'Underperforming', key: 'underperforming' as const, value: portfolio.underperforming },
      { name: 'Critical', key: 'critical' as const, value: portfolio.critical },
    ] as const
  ).filter((d) => d.value > 0);

  const sectorData = portfolio.sectorDeployed.map((s) => ({
    ...s,
    label: s.sector.length > 22 ? `${s.sector.slice(0, 20)}…` : s.sector,
  }));

  const atRiskHint =
    kpis.investmentsAtRiskPct != null
      ? `${kpis.investmentsAtRiskPct}% of active portfolio`
      : 'Share of active portfolio';

  return (
    <div className="mx-auto max-w-[1600px] space-y-8">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            // TODO: Generate board PDF pack (executive summary + charts); wire server-side PDF when ready.
            console.info('TODO: export executive report PDF');
          }}
        >
          Export report
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:flex-row lg:flex-wrap lg:items-end">
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-navy/70">
            Date range
            <select
              className="rounded-lg border border-shell-border bg-white px-3 py-2 text-sm text-navy"
              value={filter.range}
              onChange={(e) => navigate({ range: e.target.value })}
            >
              <option value="12m">Last 12 months</option>
              <option value="ytd">Year to date</option>
              <option value="all">All time</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-navy/70">
            Sector
            <select
              className="rounded-lg border border-shell-border bg-white px-3 py-2 text-sm text-navy"
              value={filter.sector ?? 'all'}
              onChange={(e) => navigate({ sector: e.target.value })}
            >
              <option value="all">All sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-navy/70">
            Geography
            <select
              className="rounded-lg border border-shell-border bg-white px-3 py-2 text-sm text-navy"
              value={filter.geography ?? 'all'}
              onChange={(e) => navigate({ geography: e.target.value })}
            >
              <option value="all">All geographies</option>
              {geographies.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
        <KPICard title="Fund applications (this year)" value={String(kpis.totalApplicationsThisYear)} />
        <KPICard
          title="Pre-screen pass rate"
          value={kpis.preScreenPassRatePct == null ? '—' : `${kpis.preScreenPassRatePct}%`}
          hint="Passed ÷ reviewed (in range)"
        />
        <KPICard
          title="Avg assessment score"
          value={kpis.avgAssessmentScore == null ? '—' : String(kpis.avgAssessmentScore)}
          hint="Completed / approved assessments"
        />
        <KPICard title="Capital approved (USD)" value={fmtUsd(kpis.totalCapitalApprovedUsd)} />
        <KPICard title="Capital deployed (USD)" value={fmtUsd(kpis.totalCapitalDeployedUsd)} />
        <KPICard title="Active portfolio" value={String(kpis.activePortfolioCount)} hint="Active & on-hold investments" />
        <KPICard
          title="Investments at risk"
          value={`${kpis.investmentsAtRiskCount}${kpis.investmentsAtRiskPct != null ? ` (${kpis.investmentsAtRiskPct}%)` : ''}`}
          hint={atRiskHint}
        />
        <KPICard title="Pending approvals" value={String(kpis.pendingApprovalsCount)} hint="Open approval tasks" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:p-5">
          <h3 className="text-sm font-semibold text-navy">Application pipeline funnel</h3>
          <p className="mt-1 text-xs text-navy/55">Volume at each milestone for applications in scope</p>
          <div className="mt-4">
            <PipelineFunnel stages={funnel} />
          </div>
        </section>

        <section className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:p-5">
          <h3 className="text-sm font-semibold text-navy">Assessment score distribution</h3>
          <p className="mt-1 text-xs text-navy/55">Completed assessments; reference at 70-point pass</p>
          <div className="mt-4 h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assessment.histogram} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-navy/10" />
                <XAxis dataKey="bucketMid" type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 70, 80, 100]} tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="text-navy/60" />
                <ReferenceLine x={70} stroke="#dc2626" strokeDasharray="4 4" label={{ value: '70 pass', fill: '#991b1b', fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(_, p) => {
                    const row = p?.[0]?.payload as { bucketLabel?: string };
                    return row?.bucketLabel ?? '';
                  }}
                  formatter={(v) => [Number(v ?? 0), 'Count']}
                />
                <Bar dataKey="count" fill={GOLD} name="Assessments" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 rounded-lg border border-shell-border bg-shell-bg/40 text-sm">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-navy hover:bg-shell-bg">
              Data table
            </summary>
            <div className="overflow-x-auto border-t border-shell-border">
              <table className="w-full text-left text-xs text-navy">
                <thead className="bg-shell-card text-navy/60">
                  <tr>
                    <th className="px-3 py-2 font-medium">Score band</th>
                    <th className="px-3 py-2 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {assessment.histogram.map((row) => (
                    <tr key={row.bucketLabel} className="border-t border-shell-border">
                      <td className="px-3 py-2">{row.bucketLabel}</td>
                      <td className="px-3 py-2 tabular-nums">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:p-5">
          <h3 className="text-sm font-semibold text-navy">Capital deployment timeline</h3>
          <p className="mt-1 text-xs text-navy/55">Disbursed tranches by month with cumulative overlay</p>
          <div className="mt-4">
            <CapitalTimeline byMonth={capital.byMonth} />
          </div>
        </section>

        <section className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:p-5">
          <h3 className="text-sm font-semibold text-navy">Portfolio performance distribution</h3>
          <p className="mt-1 text-xs text-navy/55">Active & on-hold investments by performance band</p>
          <div className="mt-4 h-72 sm:h-80">
            {riskPie.length === 0 ? (
              <p className="py-12 text-center text-sm text-navy/50">No investments in scope</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskPie as { name: string; value: number }[]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {riskPie.map((entry) => (
                      <Cell key={entry.key} fill={RISK_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [Number(v ?? 0), 'Count']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <details className="mt-3 rounded-lg border border-shell-border bg-shell-bg/40 text-sm">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-navy hover:bg-shell-bg">
              Data table
            </summary>
            <div className="overflow-x-auto border-t border-shell-border">
              <table className="w-full text-left text-xs text-navy">
                <thead className="bg-shell-card text-navy/60">
                  <tr>
                    <th className="px-3 py-2 font-medium">Band</th>
                    <th className="px-3 py-2 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-shell-border">
                    <td className="px-3 py-2">Performing</td>
                    <td className="px-3 py-2 tabular-nums">{portfolio.performing}</td>
                  </tr>
                  <tr className="border-t border-shell-border">
                    <td className="px-3 py-2">Watch</td>
                    <td className="px-3 py-2 tabular-nums">{portfolio.watch}</td>
                  </tr>
                  <tr className="border-t border-shell-border">
                    <td className="px-3 py-2">Underperforming</td>
                    <td className="px-3 py-2 tabular-nums">{portfolio.underperforming}</td>
                  </tr>
                  <tr className="border-t border-shell-border">
                    <td className="px-3 py-2">Critical</td>
                    <td className="px-3 py-2 tabular-nums">{portfolio.critical}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:p-5">
          <h3 className="text-sm font-semibold text-navy">Sector exposure (deployed)</h3>
          <p className="mt-1 text-xs text-navy/55">Disbursed capital by application primary sector</p>
          <div className="mt-4 h-72 sm:h-80">
            {sectorData.length === 0 ? (
              <p className="py-12 text-center text-sm text-navy/50">No deployed capital in scope</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-navy/10" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [fmtUsd(Number(v ?? 0)), 'Deployed']} />
                  <Bar dataKey="deployedUsd" fill={TEAL} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <details className="mt-3 rounded-lg border border-shell-border bg-shell-bg/40 text-sm">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium text-navy hover:bg-shell-bg">
              Data table
            </summary>
            <div className="overflow-x-auto border-t border-shell-border">
              <table className="w-full min-w-[280px] text-left text-xs text-navy">
                <thead className="bg-shell-card text-navy/60">
                  <tr>
                    <th className="px-3 py-2 font-medium">Sector</th>
                    <th className="px-3 py-2 font-medium">Deployed</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.sectorDeployed.map((row) => (
                    <tr key={row.sector} className="border-t border-shell-border">
                      <td className="px-3 py-2">{row.sector}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtUsd(row.deployedUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:col-span-2 lg:p-5">
          <h3 className="text-sm font-semibold text-navy">Criteria scoring breakdown</h3>
          <p className="mt-1 text-xs text-navy/55">Average weighted score by criterion (weakest dimensions at a glance)</p>
          <div className="mt-4">
            <CriteriaRadar rows={criteria} />
          </div>
        </section>
      </div>
    </div>
  );
}
