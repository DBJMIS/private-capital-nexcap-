import { num } from '@/lib/portfolio/capital-calls';
import type { VcCapitalCall, VcDistribution, VcFundSnapshot } from '@/types/database';

const MS_PER_DAY = 86400000;
const DAYS_PER_YEAR = 365;

/**
 * Multiplier applied to full-fund snapshot NAV for DBJ-aligned multiples and XIRR terminal.
 * `vc_fund_snapshots.nav` is full fund; calls/distributions are DBJ share only.
 * Null, 0, or non-finite pct → treat as 100% (whole fund, multiplier 1).
 */
export function dbjNavShareMultiplier(dbjProRataPct: number | null | undefined): number {
  const p = Number(dbjProRataPct);
  if (dbjProRataPct == null || dbjProRataPct === 0 || !Number.isFinite(p) || p <= 0) {
    return 1;
  }
  return p / 100;
}

export function applyDbjNavShareForMetrics(fullFundNav: number, dbjProRataPct: number | null | undefined): number {
  return fullFundNav * dbjNavShareMultiplier(dbjProRataPct);
}

export type FundPerformanceCashFlow = {
  date: string;
  amount: number;
  kind: 'capital_call' | 'distribution' | 'nav_terminal';
};

export type FundPerformanceMetrics = {
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  moic: number | null;
  calculated_irr: number | null;
};

export type FundPerformanceSnapshotRow = VcFundSnapshot & {
  metrics: FundPerformanceMetrics;
};

function parseYmd(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.getTime();
}

/** Cumulative capital called (DBJ share) as of date inclusive. */
export function calledThroughDate(calls: VcCapitalCall[], asOfYmd: string): number {
  const asOf = parseYmd(asOfYmd);
  let sum = 0;
  const list = calls.filter((c) => c.status !== 'cancelled').sort((a, b) => a.notice_number - b.notice_number);
  for (const c of list) {
    if (parseYmd(c.date_of_notice) > asOf) break;
    sum += num(c.call_amount);
  }
  return sum;
}

/** Cumulative distributions as of date inclusive. */
export function distributedThroughDate(distributions: VcDistribution[], asOfYmd: string): number {
  const asOf = parseYmd(asOfYmd);
  let sum = 0;
  for (const d of distributions) {
    if (parseYmd(d.distribution_date) > asOf) continue;
    sum += num(d.amount);
  }
  return sum;
}

/**
 * Excel-style XIRR: Newton–Raphson on NPV with actual/365 year fractions from first cash-flow date.
 * Amounts from LP perspective: contributions negative, distributions and terminal NAV positive.
 */
export function calculateXIRR(datesYmd: string[], amounts: number[]): number | null {
  if (datesYmd.length === 0 || datesYmd.length !== amounts.length) return null;
  const merged = new Map<string, number>();
  for (let i = 0; i < datesYmd.length; i += 1) {
    const d = datesYmd[i]!;
    const a = amounts[i]!;
    merged.set(d, (merged.get(d) ?? 0) + a);
  }
  const keys = [...merged.keys()].sort((a, b) => parseYmd(a) - parseYmd(b));
  if (keys.length < 2) return null;
  const t0 = parseYmd(keys[0]!);
  const flows = keys.map((k) => ({ t: (parseYmd(k) - t0) / (MS_PER_DAY * DAYS_PER_YEAR), amt: merged.get(k)! }));
  let pos = false;
  let neg = false;
  for (const f of flows) {
    if (f.amt > 0) pos = true;
    if (f.amt < 0) neg = true;
  }
  if (!pos || !neg) return null;

  const npv = (r: number) => {
    let s = 0;
    for (const f of flows) {
      s += f.amt / (1 + r) ** f.t;
    }
    return s;
  };
  const dnpv = (r: number) => {
    let s = 0;
    for (const f of flows) {
      s += (-f.t * f.amt) / (1 + r) ** (f.t + 1);
    }
    return s;
  };

  let r = 0.1;
  for (let iter = 0; iter < 80; iter += 1) {
    const f = npv(r);
    if (Math.abs(f) < 1e-8) return r;
    const df = dnpv(r);
    if (Math.abs(df) < 1e-12) break;
    const next = r - f / df;
    if (!Number.isFinite(next) || next <= -0.9999 || next > 100) {
      r = r * 0.5;
      continue;
    }
    r = next;
  }
  return null;
}

export function buildCashFlowsForXirr(
  calls: VcCapitalCall[],
  distributions: VcDistribution[],
  terminalNavFullFund: number,
  terminalDateYmd: string,
  dbjProRataPct?: number | null,
): { dates: string[]; amounts: number[]; points: FundPerformanceCashFlow[] } {
  const dates: string[] = [];
  const amounts: number[] = [];
  const points: FundPerformanceCashFlow[] = [];
  const asOf = parseYmd(terminalDateYmd);

  const callList = calls
    .filter((c) => c.status !== 'cancelled' && parseYmd(c.date_of_notice) <= asOf)
    .sort((a, b) => parseYmd(a.date_of_notice) - parseYmd(b.date_of_notice));
  for (const c of callList) {
    dates.push(c.date_of_notice);
    amounts.push(-num(c.call_amount));
    points.push({ date: c.date_of_notice, amount: -num(c.call_amount), kind: 'capital_call' });
  }

  const distList = distributions
    .filter((d) => parseYmd(d.distribution_date) <= asOf)
    .sort((a, b) => parseYmd(a.distribution_date) - parseYmd(b.distribution_date));
  for (const d of distList) {
    dates.push(d.distribution_date);
    amounts.push(num(d.amount));
    points.push({ date: d.distribution_date, amount: num(d.amount), kind: 'distribution' });
  }

  const terminalDbj = applyDbjNavShareForMetrics(terminalNavFullFund, dbjProRataPct);
  if (terminalDbj > 0) {
    dates.push(terminalDateYmd);
    amounts.push(terminalDbj);
    points.push({ date: terminalDateYmd, amount: terminalDbj, kind: 'nav_terminal' });
  }

  points.sort((a, b) => parseYmd(a.date) - parseYmd(b.date));
  return { dates, amounts, points };
}

export function computeFundPerformanceMetrics(
  isPvc: boolean,
  called: number,
  distributed: number,
  navFullFund: number,
  xirrDates: string[],
  xirrAmounts: number[],
  dbjProRataPct?: number | null,
): FundPerformanceMetrics {
  if (isPvc) {
    const dpi = called > 0 ? distributed / called : null;
    return { dpi, rvpi: null, tvpi: null, moic: null, calculated_irr: null };
  }
  if (called <= 0) {
    return { dpi: null, rvpi: null, tvpi: null, moic: null, calculated_irr: null };
  }
  const navDbj = applyDbjNavShareForMetrics(navFullFund, dbjProRataPct);
  const dpi = distributed / called;
  const rvpi = navDbj / called;
  const tvpi = (distributed + navDbj) / called;
  const moic = tvpi;
  const calculated_irr = calculateXIRR(xirrDates, xirrAmounts);
  return { dpi, rvpi, tvpi, moic, calculated_irr };
}

export function pickLatestSnapshot(snapshots: VcFundSnapshot[]): VcFundSnapshot | null {
  if (snapshots.length === 0) return null;
  return [...snapshots].sort((a, b) => {
    const da = parseYmd(a.snapshot_date);
    const db = parseYmd(b.snapshot_date);
    if (db !== da) return db - da;
    if (b.period_year !== a.period_year) return b.period_year - a.period_year;
    return b.period_quarter - a.period_quarter;
  })[0]!;
}

/** One entry per fund: the snapshot with the latest `snapshot_date` (then newest quarter). */
export function latestSnapshotByFund(snapshots: VcFundSnapshot[]): Map<string, VcFundSnapshot> {
  const by = new Map<string, VcFundSnapshot[]>();
  for (const s of snapshots) {
    const arr = by.get(s.fund_id) ?? [];
    arr.push(s);
    by.set(s.fund_id, arr);
  }
  const out = new Map<string, VcFundSnapshot>();
  for (const [fid, arr] of by) {
    const p = pickLatestSnapshot(arr);
    if (p) out.set(fid, p);
  }
  return out;
}

/** Latest snapshot metrics for monitoring columns (DPI always when snapshot exists; TVPI null for PVC). */
export function monitorDpiTvpiForFund(
  isPvc: boolean,
  calls: VcCapitalCall[],
  distributions: VcDistribution[],
  latest: VcFundSnapshot | null,
  dbjProRataPct?: number | null,
): { dpi: number | null; tvpi: number | null } {
  if (!latest) return { dpi: null, tvpi: null };
  const m = metricsForSnapshot(isPvc, calls, distributions, latest, dbjProRataPct);
  return { dpi: m.dpi, tvpi: isPvc ? null : m.tvpi };
}

export function metricsForSnapshot(
  isPvc: boolean,
  calls: VcCapitalCall[],
  distributions: VcDistribution[],
  snapshot: VcFundSnapshot,
  dbjProRataPct?: number | null,
): FundPerformanceMetrics {
  const asOf = snapshot.snapshot_date;
  const called = calledThroughDate(calls, asOf);
  const distributed = distributedThroughDate(distributions, asOf);
  const navFull = num(snapshot.nav);
  const { dates, amounts } = buildCashFlowsForXirr(calls, distributions, navFull, asOf, dbjProRataPct);
  return computeFundPerformanceMetrics(isPvc, called, distributed, navFull, dates, amounts, dbjProRataPct);
}

export function enrichSnapshotsWithMetrics(
  isPvc: boolean,
  calls: VcCapitalCall[],
  distributions: VcDistribution[],
  snapshots: VcFundSnapshot[],
  dbjProRataPct?: number | null,
): FundPerformanceSnapshotRow[] {
  return [...snapshots]
    .sort((a, b) => {
      const da = parseYmd(a.snapshot_date);
      const db = parseYmd(b.snapshot_date);
      if (db !== da) return db - da;
      if (b.period_year !== a.period_year) return b.period_year - a.period_year;
      return b.period_quarter - a.period_quarter;
    })
    .map((s) => ({
      ...s,
      metrics: metricsForSnapshot(isPvc, calls, distributions, s, dbjProRataPct),
    }));
}

export type MonthlyChartPoint = {
  month: string;
  calls: number;
  distributions: number;
  nav: number | null;
};

function ymFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

function ymToIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

function indexToYm(idx: number): { y: number; m: number } {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { y, m };
}

/** Month keys YYYY-MM from first activity through end; NAV forward-filled from snapshots. */
export function buildMonthlyPerformanceChart(
  calls: VcCapitalCall[],
  distributions: VcDistribution[],
  snapshots: VcFundSnapshot[],
): MonthlyChartPoint[] {
  const yms = new Set<string>();
  for (const c of calls) {
    if (c.status === 'cancelled') continue;
    yms.add(ymFromYmd(c.date_of_notice));
  }
  for (const d of distributions) {
    yms.add(ymFromYmd(d.distribution_date));
  }
  for (const s of snapshots) {
    yms.add(ymFromYmd(s.snapshot_date));
  }
  if (yms.size === 0) return [];

  let minIdx = Number.POSITIVE_INFINITY;
  let maxIdx = Number.NEGATIVE_INFINITY;
  for (const key of yms) {
    const [ys, ms] = key.split('-').map(Number) as [number, number];
    const idx = ymToIndex(ys!, ms!);
    minIdx = Math.min(minIdx, idx);
    maxIdx = Math.max(maxIdx, idx);
  }

  const snapSorted = [...snapshots].sort((a, b) => parseYmd(a.snapshot_date) - parseYmd(b.snapshot_date));
  let snapIdx = 0;
  let lastNav: number | null = null;

  const out: MonthlyChartPoint[] = [];
  for (let idx = minIdx; idx <= maxIdx; idx += 1) {
    const { y, m } = indexToYm(idx);
    const key = `${y}-${String(m).padStart(2, '0')}`;

    let callsSum = 0;
    for (const c of calls) {
      if (c.status === 'cancelled') continue;
      if (ymFromYmd(c.date_of_notice) === key) callsSum += num(c.call_amount);
    }
    let distSum = 0;
    for (const dist of distributions) {
      if (ymFromYmd(dist.distribution_date) === key) distSum += num(dist.amount);
    }

    const monthEndMs = Date.UTC(y, m, 0, 23, 59, 59, 999);
    while (snapIdx < snapSorted.length && parseYmd(snapSorted[snapIdx]!.snapshot_date) <= monthEndMs) {
      lastNav = num(snapSorted[snapIdx]!.nav);
      snapIdx += 1;
    }

    out.push({
      month: key,
      calls: callsSum,
      distributions: distSum,
      nav: lastNav,
    });
  }
  return out;
}

export function formatMetricRatio(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `value` is annual rate as decimal (e.g. 0.152 for 15.2%). */
export function formatMetricIrr(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const pct = value * 100;
  return `${pct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
