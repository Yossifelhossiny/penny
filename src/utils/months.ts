/**
 * One place for every month calculation in Penny.
 *
 * Rules:
 * - Months are 0-indexed (January = 0), like Date#getMonth().
 * - All boundaries are in the device's local time zone (Africa/Cairo for
 *   Penny's users), built with the Date(year, month, day) constructor, so
 *   Egypt's daylight-saving changes never shift a boundary.
 * - A month is the half-open range [first instant of the month, first
 *   instant of the next month). `end` below is the last millisecond, for
 *   APIs that need an inclusive upper bound (Dexie `between(..., true, true)`).
 * - Year/month arithmetic never goes through setMonth() on an existing date,
 *   which skips months when the current day is the 29th–31st.
 */

export interface YearMonth {
  year: number;
  /** 0 = January … 11 = December */
  month: number;
}

export interface MonthRange {
  start: Date;
  /** Last millisecond of the month (inclusive). */
  end: Date;
  /** First millisecond of the next month (exclusive). */
  next: Date;
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

/** Normalize any (year, month) pair, e.g. (2026, 12) → (2027, 0), (2026, -1) → (2025, 11). */
export function normalizeYearMonth(year: number, month: number): YearMonth {
  const total = year * 12 + month;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  return normalizeYearMonth(ym.year, ym.month + delta);
}

export function monthRange(year: number, month: number): MonthRange {
  const { year: y, month: m } = normalizeYearMonth(year, month);
  const start = new Date(y, m, 1);
  const next = new Date(y, m + 1, 1);
  return { start, next, end: new Date(next.getTime() - 1) };
}

export function yearRange(year: number): MonthRange {
  const start = new Date(year, 0, 1);
  const next = new Date(year + 1, 0, 1);
  return { start, next, end: new Date(next.getTime() - 1) };
}

export function yearMonthOf(date: Date): YearMonth {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function sameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

export function compareMonths(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** True if `date` falls inside the given month (local time). */
export function isInMonth(date: Date, year: number, month: number): boolean {
  const { start, next } = monthRange(year, month);
  const t = date.getTime();
  return t >= start.getTime() && t < next.getTime();
}

/** "2026-11" */
export function monthKey(year: number, month: number): string {
  const ym = normalizeYearMonth(year, month);
  return `${ym.year}-${pad2(ym.month + 1)}`;
}

export function parseMonthKey(key: string): YearMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return null;
  return { year: parseInt(m[1], 10), month };
}

export function monthLabel(year: number, month: number, style: 'long' | 'short' = 'long'): string {
  return new Date(year, month, 1).toLocaleString('en', { month: style });
}

/** All twelve months of a year, January first. */
export function monthsOfYear(year: number): YearMonth[] {
  return Array.from({ length: 12 }, (_, month) => ({ year, month }));
}

/** `count` consecutive months ending with (and including) `end`. */
export function monthsEndingAt(end: YearMonth, count: number): YearMonth[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - (count - 1)));
}

/** Days of the month that count as "elapsed" for averages. */
export function daysElapsedInMonth(year: number, month: number, now: Date = new Date()): number {
  const total = new Date(year, month + 1, 0).getDate();
  const cmp = compareMonths({ year, month }, yearMonthOf(now));
  if (cmp < 0) return total;
  if (cmp > 0) return 0;
  return Math.max(1, now.getDate());
}

/** Coerce a stored value to a valid Date (old backups may hold strings). */
export function asDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
