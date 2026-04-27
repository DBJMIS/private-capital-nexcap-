'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { RepaymentStatus } from '@/lib/portfolio/types';

const RISK_COLORS = {
  performing: '#16a34a',
  watch: '#eab308',
  underperforming: '#ea580c',
  critical: '#dc2626',
};

const REPAY_COLORS: Record<RepaymentStatus, string> = {
  current: '#16a34a',
  delinquent: '#eab308',
  default: '#dc2626',
};

type RiskDistribution = {
  performing: number;
  watch: number;
  underperforming: number;
  critical: number;
};

export function PortfolioCharts({
  riskDistribution,
  deployment_by_month,
  sector_exposure,
  repayment_breakdown,
}: {
  riskDistribution: RiskDistribution;
  deployment_by_month: { month: string; amount_usd: number }[];
  sector_exposure: { sector: string; amount_usd: number }[];
  repayment_breakdown: Record<RepaymentStatus, number>;
}) {
  const riskPie = (
    [
      { name: 'Performing', key: 'performing' as const, value: riskDistribution.performing },
      { name: 'Watch', key: 'watch' as const, value: riskDistribution.watch },
      {
        name: 'Underperforming',
        key: 'underperforming' as const,
        value: riskDistribution.underperforming,
      },
      { name: 'Critical', key: 'critical' as const, value: riskDistribution.critical },
    ] as const
  ).filter((d) => d.value > 0);

  const repaymentData = (['current', 'delinquent', 'default'] as const).map((k) => ({
    status: k,
    count: repayment_breakdown[k],
  }));

  const sectorData = sector_exposure.map((s) => ({
    ...s,
    label: s.sector.length > 24 ? `${s.sector.slice(0, 22)}…` : s.sector,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell">
        <h3 className="text-sm font-semibold text-navy">Risk distribution</h3>
        <p className="mt-1 text-xs text-navy/55">By performance band</p>
        <div className="mt-4 h-64">
          {riskPie.length === 0 ? (
            <p className="py-12 text-center text-sm text-navy/50">No active investments</p>
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
      </div>

      <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell">
        <h3 className="text-sm font-semibold text-navy">Capital deployment</h3>
        <p className="mt-1 text-xs text-navy/55">Disbursements by month (USD)</p>
        <div className="mt-4 h-64">
          {deployment_by_month.length === 0 ? (
            <p className="py-12 text-center text-sm text-navy/50">No disbursements yet</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={deployment_by_month}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-navy/10" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-navy/60" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="text-navy/60"
                  tickFormatter={(v) =>
                    new Intl.NumberFormat('en-US', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(Number(v))
                  }
                />
                <Tooltip
                  formatter={(v) =>
                    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v ?? 0))
                  }
                />
                <Line type="monotone" dataKey="amount_usd" name="Deployed" stroke="#0f766e" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:col-span-1">
        <h3 className="text-sm font-semibold text-navy">Sector exposure</h3>
        <p className="mt-1 text-xs text-navy/55">By approved amount (USD)</p>
        <div className="mt-4 h-64">
          {sectorData.length === 0 ? (
            <p className="py-12 text-center text-sm text-navy/50">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-navy/10" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  className="text-navy/60"
                  tickFormatter={(v) =>
                    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
                      Number(v),
                    )
                  }
                />
                <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v) =>
                    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v ?? 0))
                  }
                />
                <Bar dataKey="amount_usd" name="Approved" fill="#0d9488" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-shell-border bg-shell-card p-4 shadow-shell lg:col-span-1">
        <h3 className="text-sm font-semibold text-navy">Repayment status</h3>
        <p className="mt-1 text-xs text-navy/55">Latest snapshot per investment</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={repaymentData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-navy/10" />
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [Number(v ?? 0), 'Investments']} />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                {repaymentData.map((e) => (
                  <Cell key={e.status} fill={REPAY_COLORS[e.status]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
