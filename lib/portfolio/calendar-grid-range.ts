/** Pure date helpers for reporting calendar grid (shared server + client). */

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function weekStartMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Month view: 6-week grid from Monday on/before month start through 41 days later (matches PortfolioReportingCalendar). */
export function calendarMonthGridRange(cursor: Date): { from: string; to: string } {
  const s = startOfMonth(cursor);
  const gridStart = weekStartMonday(s);
  const gridEnd = addDays(gridStart, 41);
  return { from: toYmd(gridStart), to: toYmd(gridEnd) };
}

/** List view range around cursor (matches PortfolioReportingCalendar). */
export function calendarListRange(cursor: Date): { from: string; to: string } {
  const s = addDays(cursor, -45);
  const e = addDays(cursor, 120);
  return { from: toYmd(s), to: toYmd(e) };
}
