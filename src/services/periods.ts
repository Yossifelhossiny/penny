/**
 * Period queries shared by the dashboard, reports, budgets, insights and the
 * transaction list, so every screen agrees on what "November" contains.
 */

import { db } from '../db';
import type { Transaction } from '../types';
import { asDate, monthRange, monthsEndingAt, monthsOfYear, monthKey, monthLabel, yearRange, type YearMonth } from '../utils/months';

/**
 * All transactions with start <= date <= end.
 *
 * Uses the date index for normal records. IndexedDB orders keys by type
 * (numbers < dates < strings), so a record whose date was stored as a string
 * or number (e.g. by an old backup restore) would be invisible to a Date
 * range query and silently vanish from monthly totals. Those are picked up
 * separately and compared by their real time value.
 */
export async function getTransactionsBetween(start: Date, end: Date): Promise<Transaction[]> {
  const [dated, stringKeyed, numberKeyed] = await Promise.all([
    db.transactions.where('date').between(start, end, true, true).toArray(),
    db.transactions.where('date').aboveOrEqual('').toArray(),
    db.transactions.where('date').between(-Infinity, Infinity, true, true).toArray(),
  ]);
  const s = start.getTime();
  const e = end.getTime();
  const odd = [...stringKeyed, ...numberKeyed].filter((t) => {
    const d = asDate(t.date);
    return d !== null && d.getTime() >= s && d.getTime() <= e;
  });
  return odd.length === 0 ? dated : [...dated, ...odd.map((t) => ({ ...t, date: asDate(t.date)! }))];
}

export async function getMonthTransactions(year: number, month: number): Promise<Transaction[]> {
  const { start, end } = monthRange(year, month);
  return getTransactionsBetween(start, end);
}

export interface MonthTotals extends YearMonth {
  key: string;
  label: string;
  shortLabel: string;
  incomePiastres: number;
  expensesPiastres: number;
  netPiastres: number;
  transactionCount: number;
}

function emptyTotals(ym: YearMonth): MonthTotals {
  return {
    ...ym,
    key: monthKey(ym.year, ym.month),
    label: monthLabel(ym.year, ym.month, 'long'),
    shortLabel: monthLabel(ym.year, ym.month, 'short'),
    incomePiastres: 0,
    expensesPiastres: 0,
    netPiastres: 0,
    transactionCount: 0,
  };
}

/**
 * Income/expense totals for each requested month — every month is present,
 * including months with no transactions. Transfers move money between your
 * own accounts and are not income or spending.
 */
export async function getTotalsForMonths(months: YearMonth[]): Promise<MonthTotals[]> {
  if (months.length === 0) return [];
  const sorted = [...months].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const txns = await getTransactionsBetween(monthRange(first.year, first.month).start, monthRange(last.year, last.month).end);

  const byKey = new Map<string, MonthTotals>();
  for (const ym of months) byKey.set(monthKey(ym.year, ym.month), emptyTotals(ym));

  for (const t of txns) {
    const row = byKey.get(monthKey(t.date.getFullYear(), t.date.getMonth()));
    if (!row) continue;
    row.transactionCount++;
    if (t.type === 'income') row.incomePiastres += t.amount;
    else if (t.type === 'expense') row.expensesPiastres += t.amount;
  }
  for (const row of byKey.values()) row.netPiastres = row.incomePiastres - row.expensesPiastres;

  return months.map((ym) => byKey.get(monthKey(ym.year, ym.month))!);
}

/** January–December of `year`, empty months included. */
export function getYearMonthlyTotals(year: number): Promise<MonthTotals[]> {
  return getTotalsForMonths(monthsOfYear(year));
}

/** The last `count` months up to and including `end`. */
export function getRecentMonthlyTotals(end: YearMonth, count: number): Promise<MonthTotals[]> {
  return getTotalsForMonths(monthsEndingAt(end, count));
}

/** Years that have at least one transaction, plus the current year, newest first. */
export async function getActiveYears(now: Date = new Date()): Promise<number[]> {
  const years = new Set<number>([now.getFullYear()]);
  const first = await db.transactions.orderBy('date').first();
  const lastTxn = await db.transactions.orderBy('date').last();
  const a = asDate(first?.date);
  const b = asDate(lastTxn?.date);
  if (a && b) {
    // Continuous range so there are no gaps between the first year and today.
    const from = Math.min(a.getFullYear(), now.getFullYear());
    const to = Math.max(b.getFullYear(), now.getFullYear());
    for (let y = from; y <= to; y++) years.add(y);
  }
  return [...years].sort((x, y) => y - x);
}

export { yearRange };
