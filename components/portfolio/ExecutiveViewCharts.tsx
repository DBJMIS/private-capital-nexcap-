'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ExecutiveChartsPayload } from '@/lib/portfolio/executive-view';

function fmtUsdTooltip(n: number) {
  return `USD ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function yAxisUsd(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

/** Section 3 — commitment vs deployment + distribution history */
export function ExecutiveCapitalFlowCharts({ charts }: { charts: ExecutiveChartsPayload }) {
  const { commitmentBars, distributionStack } = charts;
  const { rows: distRows, series: distSeries } = distributionStack;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-[#0B1F45]">Commitment vs deployment</h3>
        <p className="mt-0.5 text-xs text-gray-400">DBJ commitment and called amounts (USD equivalent)</p>
        <div className="mt-4 h-[300px] w-full min-w-0">
          {commitmentBars.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-gray-400">No funds to display.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={commitmentBars} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="abbr" tick={{ fontSize: 11 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" tickFormatter={yAxisUsd} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as (typeof commitmentBars)[0];
                    if (!row) return null;
                    return (
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                        <p className="font-medium text-[#0B1F45]">{row.fullName}</p>
                        <p className="mt-1 text-gray-600">Committed: {fmtUsdTooltip(row.committed)}</p>
                        <p className="text-gray-600">Called: {fmtUsdTooltip(row.called)}</p>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="committed" name="Committed" fill="#0B1F45" radius={[4, 4, 0, 0]} />
                <Bar dataKey="called" name="Called" fill="#0F8A6E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-[#0B1F45]">Distribution history</h3>
        <p className="mt-0.5 text-xs text-gray-400">Stacked distributions by year (USD equivalent)</p>
        <div className="mt-4 h-[300px] w-full min-w-0">
          {distRows.length === 0 || distSeries.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-gray-400">No distribution data.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={distRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" tickFormatter={yAxisUsd} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded border border-gray-200 bg-white px-2 py-1.5 text-xs shadow">
                        {payload.map((p) => (
                          <p key={String(p.dataKey)} className="text-gray-800">
                            {p.name}: {typeof p.value === 'number' ? fmtUsdTooltip(p.value) : p.value}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {distSeries.map((s) => (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.name}
                    stackId="d"
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.85}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

/** Section 4 — compliance donut only */
export function ExecutiveComplianceDonut({
  compliancePie,
  fundCount,
}: {
  compliancePie: ExecutiveChartsPayload['compliancePie'];
  fundCount: number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-semibold text-[#0B1F45]">Compliance mix</h3>
      <div className="relative mx-auto mt-2 h-[260px] max-w-[280px]">
        {compliancePie.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-gray-400">No funds.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={compliancePie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={96}
                  paddingAngle={1}
                >
                  {compliancePie.map((e, i) => (
                    <Cell key={`${e.name}-${i}`} fill={e.fill} stroke="#fff" strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const v = payload[0].value;
                    const n = typeof v === 'number' ? v : Number(v);
                    return (
                      <div className="rounded border border-gray-200 bg-white px-2 py-1 text-xs shadow">
                        {n} fund(s)
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pr-2">
              <div className="text-center">
                <p className="text-2xl font-bold text-[#0B1F45]">{fundCount}</p>
                <p className="text-xs text-gray-500">Funds</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Section 5 — capital allocation pie */
export function ExecutiveAllocationPie({
  allocationPie,
  allocationCenterPctOfCalled,
}: {
  allocationPie: ExecutiveChartsPayload['allocationPie'];
  allocationCenterPctOfCalled: number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-semibold text-[#0B1F45]">Capital allocation</h3>
      <p className="text-xs text-gray-400">Fees vs investments (line items, USD equivalent)</p>
      <div className="relative mx-auto mt-4 h-[260px] max-w-[280px]">
        {allocationPie.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-gray-400">No allocation data.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={1}
                >
                  {allocationPie.map((e, i) => (
                    <Cell key={`${e.name}-${i}`} fill={e.fill} stroke="#fff" strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const v = payload[0].value;
                    const n = typeof v === 'number' ? v : Number(v);
                    return (
                      <div className="rounded border border-gray-200 bg-white px-2 py-1 text-xs shadow">
                        {fmtUsdTooltip(Number.isFinite(n) ? n : 0)}
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-xl font-bold text-[#0B1F45]">{allocationCenterPctOfCalled}%</p>
                <p className="text-[10px] leading-tight text-gray-500">of called</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
