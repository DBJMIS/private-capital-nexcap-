'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type PortfolioDashboardChartsProps = {
  activeFunds: number;
  barData: Array<{ name: string; fullName: string; overdue: number; status: string; fill: string }>;
  pieData: Array<{ name: string; value: number; fill: string }>;
  obligationBars: Array<{ status: string; count: number; fill: string }>;
  timelineMonths: Array<{ month: string; count: number }>;
  totalOverdueItems: number;
  countsFully: number;
  countsAudits: number;
  countsReports: number;
  hasAnyFunds: boolean;
  hasAnyObligations: boolean;
};

const COMPLIANCE_LABEL: Record<string, string> = {
  fully_compliant: 'Fully Compliant',
  audits_outstanding: 'Audits Outstanding',
  reports_outstanding: 'Reports Outstanding',
  non_compliant: 'Non-Compliant',
  partially_compliant: 'Partially Compliant',
  no_data: 'No Data',
};

export function PortfolioDashboardCharts(p: PortfolioDashboardChartsProps) {
  const {
    activeFunds,
    barData,
    pieData,
    obligationBars,
    timelineMonths,
    totalOverdueItems,
    countsFully,
    countsAudits,
    countsReports,
    hasAnyFunds,
    hasAnyObligations,
  } = p;

  const obligationHasAny = obligationBars.some((b) => b.count > 0);
  const timelineHasAny = timelineMonths.some((m) => m.count > 0);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <h2 className="font-semibold text-[#0B1F45]">Fund Compliance Status</h2>
          <p className="mt-1 text-xs text-gray-400">
            Current status across all {activeFunds} active fund{activeFunds === 1 ? '' : 's'}
          </p>
          <div className="mt-4 h-[320px] w-full min-w-0">
            {!hasAnyFunds || barData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-gray-400">No fund data to chart.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
                  barSize={24}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} stroke="#9ca3af" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                    interval={0}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as (typeof barData)[0];
                      if (!row) return null;
                      return (
                        <div className="max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                          <p className="font-medium text-[#0B1F45]">{row.fullName}</p>
                          <p className="mt-1 text-gray-600">
                            {row.overdue} overdue obligation{row.overdue === 1 ? '' : 's'}
                          </p>
                          <p className="mt-1 text-gray-500">
                            Status: {COMPLIANCE_LABEL[row.status] ?? row.status.replace(/_/g, ' ')}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="overdue" radius={4}>
                    {barData.map((entry, i) => (
                      <Cell key={`${entry.fullName}-${i}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            {[
              { c: '#0F8A6E', l: 'Fully Compliant' },
              { c: '#F59E0B', l: 'Audits Outstanding' },
              { c: '#C8973A', l: 'Reports Outstanding' },
              { c: '#EF4444', l: 'Non-Compliant' },
            ].map((x) => (
              <span key={x.l} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.c }} />
                {x.l}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-[#0B1F45]">Compliance Breakdown</h2>
          <div className="relative mt-4">
            <div className="h-[200px] w-full min-w-0">
              {!hasAnyFunds || pieData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-gray-400">No funds.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={`${entry.name}-${i}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => {
                        const v = Number(value ?? 0);
                        const n = String(name ?? '');
                        return [`${v} fund${v === 1 ? '' : 's'}`, n];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {hasAnyFunds ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-[#0B1F45]">{activeFunds}</span>
                <span className="text-xs text-gray-400">Funds</span>
              </div>
            ) : null}
          </div>
          <div className="mt-2 space-y-0 border-t border-gray-100 pt-2">
            <div className="flex items-center justify-between border-b border-gray-50 py-2 text-sm">
              <span className="text-gray-700">Fully Compliant</span>
              <span className="font-semibold text-teal-600">{countsFully}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-50 py-2 text-sm">
              <span className="text-gray-700">Audits Outstanding</span>
              <span className="font-semibold text-amber-600">{countsAudits}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-50 py-2 text-sm">
              <span className="text-gray-700">Reports Outstanding</span>
              <span className="font-semibold text-amber-600">{countsReports}</span>
            </div>
            <div className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-700">Total Overdue Items</span>
              <span className="font-semibold text-red-600">{totalOverdueItems}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-[#0B1F45]">Reporting Obligations by Status</h2>
          <p className="mt-1 text-xs text-gray-400">Across all {activeFunds} fund{activeFunds === 1 ? '' : 's'}</p>
          <div className="mt-4 h-[220px] w-full min-w-0">
            {!hasAnyObligations || !obligationHasAny ? (
              <p className="flex h-full items-center justify-center text-sm text-gray-400">No obligation data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={obligationBars} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={56}
                    stroke="#9ca3af"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} stroke="#9ca3af" />
                  <Tooltip
                    formatter={(value, _name, item) => {
                      const v = Number(value ?? 0);
                      const st = (item?.payload as { status?: string } | undefined)?.status ?? '';
                      return [`${v} obligations`, st];
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {obligationBars.map((e) => (
                      <Cell key={e.status} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-[#0B1F45]">Due in Next 90 Days</h2>
          <p className="mt-1 text-xs text-gray-400">Obligations by month</p>
          <div className="mt-4 h-[220px] w-full min-w-0">
            {!hasAnyObligations || !timelineHasAny ? (
              <p className="flex h-full items-center justify-center text-sm text-gray-400">No upcoming due dates.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineMonths} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} stroke="#9ca3af" />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const count = Number(payload[0]?.value ?? 0);
                      return (
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                          {count} obligation{count === 1 ? '' : 's'} due in {label}
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#0B1F45"
                    strokeWidth={2}
                    fill="#0B1F45"
                    fillOpacity={0.08}
                    dot={{ fill: '#0B1F45', r: 5 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {timelineMonths.map((m) => (
              <div key={m.month} className="rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-400">{m.month}</p>
                <p className="text-lg font-bold text-[#0B1F45]">{m.count}</p>
                <p className="text-[10px] text-gray-400">obligations</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
