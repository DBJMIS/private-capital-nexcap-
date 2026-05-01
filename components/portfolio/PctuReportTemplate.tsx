'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMetricIrr, formatMetricRatio } from '@/lib/portfolio/fund-performance-metrics';
import type {
  PctuMoney,
  PctuReportNarrativeAllocationRow,
  PctuReportPayload,
} from '@/lib/portfolio/pctu-report-types';

const NAVY = '#0B1F45';
const YELLOW = '#FFD700';
const TEAL = '#2E8B8B';
const AMBER = '#D4A43C';
const CHART_COLORS = [NAVY, TEAL, AMBER, '#5B7C99', '#1a4d7a', '#4a6fa5', '#0d3d66'];

const cssPage: CSSProperties = {
  fontFamily: 'Georgia, serif',
  fontSize: '10pt',
  lineHeight: 1.4,
  color: '#111',
};

function fmtMoney(m: PctuMoney | null | undefined): string {
  if (!m || !Number.isFinite(m.amount)) return 'Unknown';
  const cur = m.currency === 'JMD' ? 'JMD' : 'USD';
  return `${cur} ${m.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Display date as "May 7, 2024" from assembled "7 May 2024" (en-GB) or return trimmed / Unknown. */
function americanizeDatePrepared(s: string): string {
  const t = s.trim();
  if (!t) return 'Unknown';
  const m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return t;
  const day = Number(m[1]);
  const mon = m[2];
  const year = m[3];
  if (!Number.isFinite(day) || !year) return t;
  return `${mon} ${day}, ${year}`;
}

function narrOrNone(text: string | null | undefined): React.ReactNode {
  const t = text?.trim();
  if (!t) {
    return <p className="m-0 whitespace-pre-wrap">No commentary recorded for this period.</p>;
  }
  return <p className="m-0 whitespace-pre-wrap">{t}</p>;
}

function unknownIfDash(s: string): string {
  const t = s.trim();
  if (!t || t === '—' || t === '-') return 'Unknown';
  return t;
}

function ratioX(n: number | null): string {
  if (n == null || Number.isNaN(n)) return 'Unknown';
  return `${formatMetricRatio(n)}x`;
}

function irrPct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return 'Unknown';
  return formatMetricIrr(n);
}

function hasDepartedPrincipal(fp: PctuReportPayload['fund_profile']): boolean {
  return fp.principals.some((p) => {
    const note = (p.note ?? '').toLowerCase();
    return note.includes('departed');
  });
}

function principalFootnotes(fp: PctuReportPayload['fund_profile']): string[] {
  const lines: string[] = [];
  for (const p of fp.principals) {
    const note = p.note?.trim() ?? '';
    if (!/departed/i.test(note)) continue;
    let date = 'Unknown';
    const iso = note.match(/\d{4}-\d{2}-\d{2}/);
    const dmy = note.match(/\d{1,2}\s+[A-Za-z]+\s+\d{4}/);
    if (iso) date = iso[0]!;
    else if (dmy) date = dmy[0]!;
    lines.push(`*${p.name} departed on ${date}.`);
  }
  return lines;
}

function parseAllocationPct(row: PctuReportNarrativeAllocationRow): number {
  const n = Number(String(row.percentage).replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function jamaicaPipelinePct(rows: PctuReportNarrativeAllocationRow[]): number | null {
  for (const r of rows) {
    if (/jamaica/i.test(r.label)) return parseAllocationPct(r);
  }
  return null;
}

function pieDataFromRows(rows: PctuReportNarrativeAllocationRow[]): { name: string; value: number }[] {
  return rows
    .map((r) => ({ name: r.label || 'Unknown', value: parseAllocationPct(r) }))
    .filter((d) => d.value > 0 || d.name !== 'Unknown');
}

function splitImpactMainAndBullets(impact: string | null): { main: string | null; bullets: string[] } {
  const t = impact?.trim();
  if (!t) return { main: null, bullets: [] };
  const lines = t.split(/\n+/);
  const bulletIdx = lines.findIndex((l) => {
    const s = l.trim();
    return /^[•\-*]\s?\S/.test(s) || /^[-–]\s\S/.test(s);
  });
  if (bulletIdx === -1) return { main: t, bullets: [] };
  const main = lines.slice(0, bulletIdx).join('\n').trim() || null;
  const bullets = lines
    .slice(bulletIdx)
    .map((l) => l.trim().replace(/^[•\-*]\s?/, '').replace(/^[-–]\s/, '').trim())
    .filter(Boolean);
  return { main, bullets };
}

function SectionNavyBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full px-3 py-1.5 font-bold text-white"
      style={{ backgroundColor: NAVY, fontSize: '11pt' }}
    >
      {children}
    </div>
  );
}

function MiniNavyHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: NAVY }}>
      {children}
    </div>
  );
}

function DbjCommitmentBarChart({ data }: { data: { name: string; amount: number; fill: string }[] }) {
  if (data.every((d) => !Number.isFinite(d.amount) || d.amount === 0)) {
    return (
      <div className="flex h-[180px] items-center justify-center border border-[#0B1F45] text-sm" style={{ borderWidth: '0.5px' }}>
        Unknown
      </div>
    );
  }
  return (
    <div className="w-full" style={{ height: 180 }}>
      <p className="mb-1 text-center text-[10pt] font-semibold text-black">DBJ Commitments &amp; Drawdowns</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => (Number.isFinite(v) ? Number(v).toLocaleString() : '')} />
          <YAxis type="category" dataKey="name" width={148} tick={{ fontSize: 8 }} interval={0} />
          <Tooltip formatter={(v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : 'Unknown')} />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {data.map((e, i) => (
              <Cell key={i} fill={e.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AllocationPie({
  title,
  rows,
}: {
  title: string;
  rows: PctuReportNarrativeAllocationRow[];
}) {
  const pie = pieDataFromRows(rows);
  if (pie.length === 0) {
    return (
      <div className="flex flex-col items-center">
        {title ? <p className="mb-2 text-center text-[10pt] font-semibold">{title}</p> : null}
        <div
          className="flex w-full max-w-[280px] items-center justify-center border text-sm"
          style={{ borderColor: NAVY, borderWidth: '0.5px', height: 250 }}
        >
          Unknown
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center">
      {title ? <p className="mb-2 text-center text-[10pt] font-semibold">{title}</p> : null}
      <div style={{ width: '100%', maxWidth: 280, height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}>
              {pie.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => (typeof v === 'number' && Number.isFinite(v) ? `${v}%` : 'Unknown')} />
            <Legend wrapperStyle={{ fontSize: '9pt' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PctuReportTemplate({ data, showLogo }: { data: PctuReportPayload; showLogo: boolean }) {
  const {
    header,
    fund_profile,
    fund_capital_account,
    dbj_capital_account,
    portfolio_overview,
    fund_financial_performance,
    esg_considerations,
    updates_and_risk,
    assessment_footer,
    narrative_fund_meta,
    narrative_allocations,
    narrative_fund_lps,
    narrative_pipeline,
  } = data;

  const fp = fund_profile;
  const ic = fp.investment_committee;
  const meta = narrative_fund_meta;
  const departed = hasDepartedPrincipal(fp);
  const principalsTitle = departed ? 'Principals*' : 'Principals';
  const jmPct = jamaicaPipelinePct(narrative_allocations.geographic);
  const barData = [
    { name: 'Total Commitments', amount: dbj_capital_account.total_commitment.amount, fill: NAVY },
    { name: 'Total Drawdown since Inception', amount: dbj_capital_account.total_drawdown.amount, fill: TEAL },
    { name: 'Remaining Commitment', amount: dbj_capital_account.remaining_commitment.amount, fill: AMBER },
  ];

  const dpiVal = fund_financial_performance.dpi;
  const dpiStr = ratioX(dpiVal);
  const dpiNote =
    dpiVal != null && !Number.isNaN(dpiVal) && dpiVal === 0 ? (
      <span className="text-[9pt] text-gray-600"> (No distributions)</span>
    ) : null;

  const divestCount =
    portfolio_overview.divestment_count === 0 ? '-' : String(portfolio_overview.divestment_count);
  const divestVal = portfolio_overview.total_divestment_value
    ? fmtMoney(portfolio_overview.total_divestment_value)
    : portfolio_overview.divestment_count === 0
      ? '-'
      : 'Unknown';

  const noPipelineNarrative =
    narrative_pipeline.deal_count === 'Unknown' &&
    narrative_pipeline.pipeline_value === 'Unknown' &&
    narrative_pipeline.largest_sectors === 'Unknown' &&
    narrative_pipeline.term_sheets_issued === 'Unknown' &&
    narrative_pipeline.term_sheets_value === 'Unknown' &&
    jmPct == null;

  const { main: impactMain, bullets: impactBulletList } = splitImpactMainAndBullets(updates_and_risk.impact);

  return (
    <div
      className="pctu-report mx-auto box-border bg-white text-black print:shadow-none"
      style={{
        ...cssPage,
        width: '210mm',
        maxWidth: '100%',
        minHeight: '297mm',
        padding: '20mm',
      }}
    >
      <style>{`
        @media print {
          .pctu-report { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .pctu-break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
          .pctu-page-break-before { break-before: page; page-break-before: always; }
        }
        .pctu-break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
        .pctu-page-break-before { break-before: page; page-break-before: always; }
        .pctu-table-navy { border-collapse: collapse; border: 0.5px solid ${NAVY}; }
        .pctu-table-navy td { border: 0.5px solid ${NAVY}; }
      `}</style>

      {/* Top header band */}
      <header className="pctu-break-inside-avoid mb-6 w-full">
        {showLogo ? (
          <div className="mb-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <Image
              src="/branding/dbj-logo.svg"
              alt="DBJ"
              width={140}
              height={40}
              className="mx-auto h-10 w-auto max-w-[140px] object-contain"
            />
          </div>
        ) : null}
        <div className="text-center">
          <p className="m-0 font-bold" style={{ fontSize: '13pt', fontFamily: 'Georgia, serif' }}>
            Development Bank of Jamaica Limited
          </p>
          <p className="m-0 mt-1" style={{ fontSize: '12pt', fontFamily: 'Georgia, serif' }}>
            Private Capital Technical Unit
          </p>
          <p className="m-0 mt-1" style={{ fontSize: '12pt', fontFamily: 'Georgia, serif' }}>
            Quarterly Funds Review Report ({header.period_label || 'Unknown'})
          </p>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
          <div>
            <span
              className="inline-block font-bold text-black"
              style={{ backgroundColor: YELLOW, padding: '4px 12px', fontSize: '10pt' }}
            >
              Name of Fund: {header.fund_name?.trim() || 'Unknown'}
            </span>
          </div>
          <div className="text-left sm:text-right" style={{ fontSize: '10pt' }}>
            Date prepared: {americanizeDatePrepared(header.date_prepared)}
          </div>
        </div>
      </header>

      {/* SECTION 1 — FUND PROFILE */}
      <section className="pctu-break-inside-avoid mb-6">
        <SectionNavyBar>Fund Profile</SectionNavyBar>
        <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-[3fr_2fr]">
          <div>
            <p className="m-0 whitespace-pre-wrap">
              {unknownIfDash(meta.fund_strategy_summary)}
            </p>
            <p className="m-0 mt-4">&nbsp;</p>
            <p className="m-0">
              <span className="font-semibold">Business Registration: </span>
              {fp.business_registration?.trim() ? fp.business_registration.trim() : 'Unknown'}
            </p>
            <p className="m-0 mt-1">
              <span className="font-semibold">DBJ Investment: </span>
              {fp.investment_type?.trim() ? fp.investment_type.trim() : 'Unknown'}
            </p>
          </div>
          <div className="space-y-1 text-[10pt]">
            <p className="m-0">
              <span className="font-semibold">Fund Vintage: </span>
              {unknownIfDash(meta.fund_vintage)}
            </p>
            <p className="m-0">
              <span className="font-semibold">Fund size: </span>
              {unknownIfDash(meta.fund_size)}
            </p>
            <p className="m-0">
              <span className="font-semibold">First Close: </span>
              {unknownIfDash(meta.first_close)}
            </p>
            <p className="m-0">
              <span className="font-semibold">Fund Life: </span>
              {meta.fund_life_years === 'Unknown'
                ? 'Unknown years, extendable to Unknown'
                : `${meta.fund_life_years} years, extendable to Unknown`}
            </p>
            <p className="m-0">
              <span className="font-semibold">Final Close: </span>
              {unknownIfDash(meta.final_close)}
            </p>
            <p className="m-0">
              <span className="font-semibold">Year End: </span>
              {unknownIfDash(meta.year_end)}
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2 — PRINCIPALS */}
      <section className="pctu-break-inside-avoid mb-6">
        <SectionNavyBar>{principalsTitle}</SectionNavyBar>
        <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-[3fr_2fr]">
          <div>
            {fp.principals.length === 0 ? (
              <p className="m-0 text-center text-sm">Unknown</p>
            ) : (
              <table className="pctu-table-navy w-full text-[10pt]">
                <tbody>
                  {fp.principals.map((p, i) => (
                    <tr key={`${p.name}-${i}`} style={{ backgroundColor: i % 2 === 1 ? '#F8F8F8' : '#fff' }}>
                      <td className="align-top px-2 py-2 font-semibold" style={{ width: '38%' }}>
                        {p.name}
                        {p.role ? ` / ${p.role}` : ''}
                      </td>
                      <td className="align-top px-2 py-2 leading-snug text-gray-900">
                        {p.note?.trim() ? p.note.trim() : 'Unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {departed ? (
              <div className="mt-3 space-y-1 text-[9pt] italic text-gray-800">
                {principalFootnotes(fp).map((line, i) => (
                  <p key={i} className="m-0">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <MiniNavyHeader>Directors</MiniNavyHeader>
            {fp.directors.length === 0 ? (
              <p className="m-0 text-sm">Unknown</p>
            ) : (
              <ul className="m-0 list-disc pl-5 text-[10pt]">
                {fp.directors.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
            <MiniNavyHeader>Investment Committee</MiniNavyHeader>
            {!ic.has_ic ? (
              <p className="m-0 text-[10pt] italic">
                *{ic.structure_note?.trim() || 'Unknown'}
              </p>
            ) : ic.members.length === 0 ? (
              <p className="m-0 text-sm">Unknown</p>
            ) : (
              <ul className="m-0 list-disc pl-5 text-[10pt]">
                {ic.members.map((m) => (
                  <li key={m.name}>
                    {m.name}
                    {m.role ? ` — ${m.role}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3 — FUND CAPITAL ACCOUNT + LPs */}
      <section className="pctu-break-inside-avoid mb-6">
        <SectionNavyBar>Fund Capital Account</SectionNavyBar>
        <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-[3fr_2fr]">
          <div>
            <table className="pctu-table-navy w-full text-[10pt]">
              <tbody>
                {(
                  [
                    ['Total Commitments', fund_capital_account.total_commitments],
                    ['Portfolio Company Drawdowns', fund_capital_account.portfolio_drawdowns],
                    ['Fee Drawdowns', fund_capital_account.fee_drawdowns],
                  ] as const
                ).map(([label, m], i) => (
                  <tr key={label} style={{ backgroundColor: i % 2 === 1 ? '#F8F8F8' : '#fff' }}>
                    <td className="px-2 py-1.5">{label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(m)}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: '#fff' }}>
                  <td className="px-2 py-1.5 pl-6">Management Fees</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(fund_capital_account.management_fees)}</td>
                </tr>
                <tr style={{ backgroundColor: '#F8F8F8' }}>
                  <td className="px-2 py-1.5 pl-6">Administrative Fees</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(fund_capital_account.administrative_fees)}</td>
                </tr>
                <tr style={{ backgroundColor: '#fff' }}>
                  <td className="px-2 py-1.5 pl-6">Other Fund Fees</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(fund_capital_account.other_fund_fees)}</td>
                </tr>
                {(
                  [
                    ['Total Drawdown since Inception', fund_capital_account.total_drawdown_inception],
                    ['Remaining Commitment', fund_capital_account.remaining_commitment],
                  ] as const
                ).map(([label, m], i) => (
                  <tr key={label} style={{ backgroundColor: i % 2 === 0 ? '#F8F8F8' : '#fff' }}>
                    <td className="px-2 py-1.5 font-semibold">{label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtMoney(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-center font-bold text-white" style={{ backgroundColor: NAVY, padding: '6px 12px', fontSize: '10pt' }}>
              Fund LPs
            </div>
            {narrative_fund_lps.length === 0 ? (
              <div
                className="flex min-h-[120px] items-center justify-center border text-sm text-gray-700"
                style={{ borderColor: NAVY, borderWidth: '0.5px', borderTop: 0 }}
              >
                Unknown
              </div>
            ) : (
              <table className="pctu-table-navy w-full text-[9pt]" style={{ borderTop: 0 }}>
                <thead>
                  <tr className="bg-[#F8F8F8]">
                    <th className="px-2 py-1 text-left font-semibold">LP Name</th>
                    <th className="px-2 py-1 text-right font-semibold">Commitment</th>
                    <th className="px-2 py-1 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {narrative_fund_lps.map((lp, i) => (
                    <tr key={`${lp.name}-${i}`} style={{ backgroundColor: i % 2 === 1 ? '#F8F8F8' : '#fff' }}>
                      <td className="px-2 py-1">{lp.name}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{unknownIfDash(lp.commitment)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{unknownIfDash(lp.percentage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 4 — DBJ CAPITAL ACCOUNT + CHART */}
      <section className="pctu-break-inside-avoid mb-6">
        <SectionNavyBar>DBJ Capital Account</SectionNavyBar>
        <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-[3fr_2fr]">
          <div className="space-y-1 text-[10pt]">
            <p className="m-0">
              <span className="font-semibold">Total Commitments </span>
              {fmtMoney(dbj_capital_account.total_commitment)}
            </p>
            <p className="m-0">
              <span className="font-semibold">Total Drawdown since Inception </span>
              {fmtMoney(dbj_capital_account.total_drawdown)}
            </p>
            <p className="m-0">
              <span className="font-semibold">Remaining Commitment </span>
              {fmtMoney(dbj_capital_account.remaining_commitment)}
            </p>
          </div>
          <DbjCommitmentBarChart data={barData} />
        </div>
      </section>

      {/* SECTION 5 — PORTFOLIO + PIPELINE */}
      <section className="pctu-break-inside-avoid mb-6">
        <SectionNavyBar>Portfolio Overview</SectionNavyBar>
        <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-[3fr_2fr]">
          <div className="space-y-1 text-[10pt]">
            <p className="m-0">
              <span className="font-semibold">Number of investments since inception </span>
              {Number.isFinite(portfolio_overview.investment_count) ? portfolio_overview.investment_count : 'Unknown'}
            </p>
            <p className="m-0">
              <span className="font-semibold">Total investment in Portfolio Companies </span>
              {fmtMoney(portfolio_overview.total_portfolio_investment)}
            </p>
            <p className="m-0">
              <span className="font-semibold">Total number of divestments/exits </span>
              {divestCount}
            </p>
            <p className="m-0">
              <span className="font-semibold">Total value of divestments/exits </span>
              {divestVal}
            </p>
          </div>
          <div>
            <div
              className="px-3 py-1.5 text-center text-[10pt] font-bold text-black"
              style={{ backgroundColor: YELLOW }}
            >
              Pipeline
            </div>
            <div
              className="min-h-[100px] border px-3 py-2 text-[10pt]"
              style={{ borderColor: NAVY, borderWidth: '0.5px', borderTop: 0 }}
            >
              {noPipelineNarrative ? (
                <div className="flex h-full min-h-[80px] items-center justify-center text-sm">Unknown</div>
              ) : (
                <ul className="m-0 list-disc pl-5">
                  <li>
                    {narrative_pipeline.deal_count === 'Unknown' ? 'Unknown deals' : `${narrative_pipeline.deal_count} deals`}
                  </li>
                  {narrative_allocations.geographic.length > 0 && jmPct != null ? (
                    <li>Jamaica represents over {jmPct}% of pipeline volume</li>
                  ) : null}
                  <li>
                    {narrative_pipeline.largest_sectors === 'Unknown'
                      ? 'Largest sector exposures: Unknown'
                      : `${narrative_pipeline.largest_sectors} largest sector exposures`}
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* PAGE 2 */}
      <div className="pctu-page-break-before">
        {/* SECTION 6 — ALLOCATIONS */}
        <section className="pctu-break-inside-avoid mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div
              className="flex items-center justify-center border-0 py-1.5 text-center text-[11pt] font-bold text-white sm:border-r"
              style={{ backgroundColor: NAVY, borderColor: NAVY, borderWidth: '0.5px' }}
            >
              Sector Allocation
            </div>
            <div
              className="flex items-center justify-center py-1.5 text-center text-[11pt] font-bold text-white"
              style={{ backgroundColor: NAVY }}
            >
              Geographic Allocation
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="border border-t-0 p-3 sm:border-r-0" style={{ borderColor: NAVY, borderWidth: '0.5px' }}>
              <AllocationPie title="" rows={narrative_allocations.sectors} />
            </div>
            <div className="border border-t-0 p-3 sm:border-l-0" style={{ borderColor: NAVY, borderWidth: '0.5px' }}>
              <AllocationPie title="" rows={narrative_allocations.geographic} />
            </div>
          </div>
        </section>

        {/* SECTION 7 — FINANCIAL PERFORMANCE */}
        <section className="pctu-break-inside-avoid mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div
              className="flex items-center justify-center py-1.5 text-center text-[11pt] font-bold text-white sm:border-r"
              style={{ backgroundColor: NAVY, borderColor: NAVY, borderWidth: '0.5px' }}
            >
              Fund Financial Performance
            </div>
            <div
              className="flex items-center justify-center py-1.5 text-center text-[11pt] font-bold text-black"
              style={{ backgroundColor: YELLOW }}
            >
              Performance Metrics
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="space-y-1 border border-t-0 p-3 text-[10pt] sm:border-r-0" style={{ borderColor: NAVY, borderWidth: '0.5px' }}>
              <p className="m-0">
                <span className="font-semibold">Net Assets Value: </span>
                {fund_financial_performance.nav ? fmtMoney(fund_financial_performance.nav) : 'Unknown'}
              </p>
              {fund_financial_performance.nav_per_share != null && Number.isFinite(fund_financial_performance.nav_per_share) ? (
                <p className="m-0">
                  <span className="font-semibold">NAV/share: </span>
                  {fund_financial_performance.nav_per_share.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </p>
              ) : null}
            </div>
            <div className="space-y-1 border border-t-0 p-3 text-[10pt] sm:border-l-0" style={{ borderColor: NAVY, borderWidth: '0.5px' }}>
              <p className="m-0">
                <span className="font-semibold">DBJ IRR: </span>
                {irrPct(fund_financial_performance.calculated_irr)}
              </p>
              <p className="m-0">
                <span className="font-semibold">MOIC: </span>
                {ratioX(fund_financial_performance.tvpi)}
              </p>
              <p className="m-0">
                <span className="font-semibold">DPI: </span>
                {dpiStr}
                {dpiNote}
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 8 — ESG */}
        <section className="pctu-break-inside-avoid mb-6">
          <SectionNavyBar>ESG Considerations</SectionNavyBar>
          <div className="mt-3 px-1">
            {esg_considerations.length === 0 ? (
              <p className="m-0 text-sm">Unknown</p>
            ) : (
              <ul className="m-0 list-disc pl-6 text-[10pt]">
                {esg_considerations.map((line, i) => (
                  <li key={i}>{line.trim() || 'Unknown'}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* SECTION 9 — UPDATES & RISK */}
        <section className="pctu-break-inside-avoid mb-6">
          <SectionNavyBar>Updates &amp; Risk Assessment</SectionNavyBar>
          <div className="mt-4 space-y-5 text-[10pt]">
            <div className="pctu-break-inside-avoid">
              <p className="m-0 mb-1 font-bold">Quarterly Update</p>
              {narrOrNone(updates_and_risk.quarterly_update)}
            </div>
            <div className="pctu-break-inside-avoid">
              <p className="m-0 mb-1 font-bold">Fund Management Team</p>
              {narrOrNone(updates_and_risk.fund_management_team_narrative)}
            </div>
            <div className="pctu-break-inside-avoid">
              <p className="m-0 mb-1 font-bold">Fundraising Update</p>
              {narrOrNone(updates_and_risk.fundraising_update)}
            </div>
            <div className="pctu-break-inside-avoid">
              <p className="m-0 mb-1 font-bold">Pipeline Development</p>
              {narrOrNone(updates_and_risk.pipeline_development)}
            </div>
            <div className="pctu-break-inside-avoid">
              <p className="m-0 mb-1 font-bold">Compliance Matters – Audited Report</p>
              {narrOrNone(updates_and_risk.compliance_matters)}
            </div>
            <div className="pctu-break-inside-avoid">
              <p className="m-0 mb-1 font-bold">Impact from Further Investment within the Fund</p>
              {impactMain ? <p className="m-0 whitespace-pre-wrap">{impactMain}</p> : null}
              {!impactMain && impactBulletList.length === 0 ? narrOrNone(updates_and_risk.impact) : null}
              {impactBulletList.length > 0 ? (
                <ul className="mt-2 list-disc pl-6">
                  {impactBulletList.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="pctu-break-inside-avoid">
              <p className="m-0 mb-1 font-bold">Outlook</p>
              {narrOrNone(updates_and_risk.outlook)}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-8 rounded border border-gray-200 bg-gray-50 p-4 text-[9pt] print:hidden">
        <p className="m-0 font-bold text-[#0B1F45]">Assessment summary (screen only)</p>
        <p className="mt-2">
          Weighted total {assessment_footer.weighted_total.toFixed(1)} · {assessment_footer.category} ·{' '}
          {assessment_footer.recommendation}
        </p>
        <p className="mt-1 text-gray-600">
          {assessment_footer.assessed_by} / {assessment_footer.approved_by} · {assessment_footer.approved_at}
        </p>
      </section>

      <footer className="mt-8 border-t border-gray-200 pt-3 text-center text-[9pt] text-gray-500 print:hidden">
        <p className="m-0">
          {header.fund_name} · {header.period_label}
        </p>
        <p className="m-0 mt-1">CONFIDENTIAL — DBJ Private Capital Technical Unit</p>
      </footer>
    </div>
  );
}
