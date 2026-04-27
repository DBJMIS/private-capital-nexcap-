'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { FunnelStage } from '@/lib/reports/queries';

export function PipelineFunnel({ stages }: { stages: FunnelStage[] }) {
  const data = stages.map((s, i) => ({
    ...s,
    dropPct:
      i === 0 || stages[i - 1].count === 0
        ? null
        : Math.round((1 - s.count / stages[i - 1].count) * 1000) / 10,
  }));

  return (
    <div className="space-y-3">
      <div className="h-72 w-full min-w-0 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-navy/10" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} className="text-navy/60" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fontSize: 11 }}
              className="text-navy/70"
            />
            <Tooltip
              formatter={(v, _n, p) => {
                const n = Number(v ?? 0);
                const row = p?.payload as { dropPct: number | null };
                const drop = row?.dropPct;
                const extra = drop != null ? ` (${drop}% vs prior)` : '';
                return [`${n}${extra}`, 'Count'];
              }}
            />
            <Bar dataKey="count" name="Applications" fill="#c8973a" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="count" position="right" className="fill-navy text-xs" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="rounded-lg border border-shell-border bg-shell-bg/40 text-sm">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium text-navy hover:bg-shell-bg">
          Data table
        </summary>
        <div className="overflow-x-auto border-t border-shell-border">
          <table className="w-full min-w-[320px] text-left text-xs text-navy">
            <thead className="bg-shell-card text-navy/60">
              <tr>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Count</th>
                <th className="px-3 py-2 font-medium">Drop-off vs prior</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.key} className="border-t border-shell-border">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 tabular-nums">{row.count}</td>
                  <td className="px-3 py-2 tabular-nums text-navy/70">
                    {row.dropPct == null ? '—' : `${row.dropPct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
