/**
 * Executive report date range and dimension filters.
 * File path: lib/reports/filters.ts
 */

export type ReportRangePreset = '12m' | 'ytd' | 'all';

export type ReportFilters = {
  range: ReportRangePreset;
  sector: string | null;
  geography: string | null;
  dateFrom: Date | null;
  dateTo: Date;
};

function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

export function buildReportFilters(params: {
  range?: string | null;
  sector?: string | null;
  geography?: string | null;
}): ReportFilters {
  const now = new Date();
  const range = (params.range === 'ytd' || params.range === 'all' ? params.range : '12m') as ReportRangePreset;

  let dateFrom: Date | null = null;
  const dateTo = now;

  if (range === '12m') {
    dateFrom = new Date(now);
    dateFrom.setUTCMonth(dateFrom.getUTCMonth() - 12);
  } else if (range === 'ytd') {
    dateFrom = startOfYear(now);
  }

  const sector = params.sector?.trim() && params.sector !== 'all' ? params.sector.trim() : null;
  const geography = params.geography?.trim() && params.geography !== 'all' ? params.geography.trim() : null;

  return { range, sector, geography, dateFrom, dateTo };
}

/** Application "as of" timestamp for range checks */
export function applicationAsOfDate(row: { submitted_at: string | null; created_at: string }): Date {
  if (row.submitted_at) return new Date(row.submitted_at);
  return new Date(row.created_at);
}

export function applicationInDateRange(row: { submitted_at: string | null; created_at: string }, from: Date | null, to: Date): boolean {
  if (!from) return true;
  const t = applicationAsOfDate(row).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export function applicationMatchesSector(
  row: { onboarding_metadata?: unknown },
  sector: string | null,
): boolean {
  if (!sector) return true;
  if (!row.onboarding_metadata || typeof row.onboarding_metadata !== 'object') return false;
  const m = row.onboarding_metadata as Record<string, unknown>;
  const s = typeof m.primary_sector === 'string' ? m.primary_sector.trim() : '';
  return s.toLowerCase() === sector.toLowerCase();
}

export function applicationMatchesGeography(
  row: { geographic_area: string; country_of_incorporation: string },
  geography: string | null,
): boolean {
  if (!geography) return true;
  const g = geography.toLowerCase();
  return (
    row.geographic_area.toLowerCase().includes(g) || row.country_of_incorporation.toLowerCase().includes(g)
  );
}

/** Sector + geography only (ignores date range). Used for YTD application KPI while charts use range. */
export function filterApplicationsDimensions<T extends {
  status: string;
  geographic_area: string;
  country_of_incorporation: string;
  onboarding_metadata?: unknown;
}>(apps: T[], f: ReportFilters): T[] {
  return apps.filter(
    (a) =>
      applicationMatchesSector(a, f.sector) &&
      applicationMatchesGeography(a, f.geography) &&
      a.status !== 'draft',
  );
}

export function countApplicationsThisUtcYear<T extends { submitted_at: string | null; created_at: string }>(
  apps: T[],
): number {
  const y = new Date().getUTCFullYear();
  return apps.filter((a) => applicationAsOfDate(a).getUTCFullYear() === y).length;
}
