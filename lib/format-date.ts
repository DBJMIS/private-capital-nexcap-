/**
 * Explicit `en-GB` + options so server-rendered HTML matches the browser (avoids hydration
 * mismatches from default `toLocaleDateString()` / `toLocaleString()` locale differences).
 */
const SHORT_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

const SHORT_DATE_TIME: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const LOCALE = 'en-GB';

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, SHORT_DATE).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, SHORT_DATE_TIME).format(new Date(iso));
}
