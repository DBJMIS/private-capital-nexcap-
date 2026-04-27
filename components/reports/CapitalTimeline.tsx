'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { CapitalSummary } from '@/lib/reports/queries';

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function CapitalTimeline({ byMonth }: { byMonth: CapitalSummary['byMonth'] }) {
  if (byMonth.length === 0) {
    return <p className="py-10 text-center text-sm text-navy/50">No disbursed tranches in this range.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="h-72 w-full min-w-0 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={byMonth} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-navy/10" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-navy/60" />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              className="text-navy/60"
              tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            />
            <Tooltip
              formatter={(value, name) => {
                const n = Number(value ?? 0);
                return name === 'cumulativeUsd' ? [fmtUsd(n), 'Cumulative deployed'] : [fmtUsd(n), 'Monthly'];
              }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="deployedUsd" name="Monthly disbursements" fill="#c8973a" radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="cumulativeUsd"
              name="Cumulative deployed"
              stroke="#0f8a6e"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <details className="rounded-lg border border-shell-border bg-shell-bg/40 text-sm">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium text-navy hover:bg-shell-bg">
          Data table
        </summary>
        <div className="overflow-x-auto border-t border-shell-border">
          <table className="w-full min-w-[360px] text-left text-xs text-navy">
            <thead className="bg-shell-card text-navy/60">
              <tr>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 font-medium">Deployed</th>
                <th className="px-3 py-2 font-medium">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((row) => (
                <tr key={row.month} className="border-t border-shell-border">
                  <td className="px-3 py-2">{row.month}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtUsd(row.deployedUsd)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtUsd(row.cumulativeUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
