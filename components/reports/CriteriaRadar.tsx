'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { CriteriaBreakdownRow } from '@/lib/reports/queries';

export function CriteriaRadar({ rows }: { rows: CriteriaBreakdownRow[] }) {
  const data = rows.map((r) => ({
    criteria: r.label,
    avg: r.avgScore ?? 0,
    fullMark: 100,
  }));

  const hasAny = rows.some((r) => r.avgScore != null);

  if (!hasAny) {
    return <p className="py-10 text-center text-sm text-navy/50">No scored criteria for completed assessments.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="mx-auto h-80 w-full max-w-lg">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="78%" data={data}>
            <PolarGrid className="stroke-navy/15" />
            <PolarAngleAxis dataKey="criteria" tick={{ fontSize: 10, fill: '#0b1f45' }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
            <Radar name="Avg score" dataKey="avg" stroke="#0f8a6e" fill="rgba(15, 138, 110, 0.35)" />
            <Tooltip formatter={(v) => [`${Number(v ?? 0).toFixed(1)}`, 'Avg (0–100 scale)']} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <details className="rounded-lg border border-shell-border bg-shell-bg/40 text-sm">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium text-navy hover:bg-shell-bg">
          Data table
        </summary>
        <div className="overflow-x-auto border-t border-shell-border">
          <table className="w-full text-left text-xs text-navy">
            <thead className="bg-shell-card text-navy/60">
              <tr>
                <th className="px-3 py-2 font-medium">Criterion</th>
                <th className="px-3 py-2 font-medium">Avg score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-shell-border">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 tabular-nums">{r.avgScore == null ? '—' : r.avgScore.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
