/**
 * Automatic monthly income (e.g. salary on the 1st).
 *
 * Runs whenever Penny opens, comes back to the foreground, or receives an SMS
 * push. Each month is recorded at most once: the transaction carries a unique
 * key "rec:<id>:<YYYY-MM>", enforced by a unique index, so running it again —
 * or in two places at once — can never double the income. If Penny wasn't
 * opened for a while, missed months are filled in (never before startMonth).
 */

import { db } from '../db';
import type { RecurringIncome } from '../types';
import { addMonths, compareMonths, monthKey, parseMonthKey, yearMonthOf } from '../utils/months';

export function recurringKey(id: number, year: number, month: number): string {
  return `rec:${id}:${monthKey(year, month)}`;
}

/** The date an entry for (year, month) is recorded on. */
export function occurrenceDate(rule: Pick<RecurringIncome, 'dayOfMonth'>, year: number, month: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(1, rule.dayOfMonth), last), 9, 0, 0);
}

/** First month that will be recorded if the rule is turned on now. */
export function defaultStartMonth(dayOfMonth: number, now: Date = new Date()): string {
  const current = yearMonthOf(now);
  const thisMonthDate = occurrenceDate({ dayOfMonth }, current.year, current.month);
  // Already past this month's day → start next month (this month is probably recorded already).
  const start = now.getTime() > thisMonthDate.getTime() + 24 * 60 * 60 * 1000 ? addMonths(current, 1) : current;
  return monthKey(start.year, start.month);
}

export async function getRecurringIncomes(): Promise<RecurringIncome[]> {
  return db.recurring.toArray();
}

export async function saveRecurringIncome(input: Omit<RecurringIncome, 'id' | 'createdAt'> & { id?: number }): Promise<number> {
  if (!(input.amountPiastres > 0)) throw new Error('Enter an amount greater than zero');
  if (!input.accountId) throw new Error('Choose an account');
  if (!input.categoryId) throw new Error('Choose a category');
  const day = Math.round(input.dayOfMonth);
  if (day < 1 || day > 28) throw new Error('Day must be between 1 and 28');
  if (!parseMonthKey(input.startMonth)) throw new Error('Invalid start month');
  const data = { ...input, dayOfMonth: day, name: input.name.trim() || 'Salary' };
  if (input.id) {
    await db.recurring.update(input.id, data);
    return input.id;
  }
  return (await db.recurring.add({ ...data, createdAt: new Date() })) as number;
}

export async function setRecurringEnabled(id: number, enabled: boolean, now: Date = new Date()): Promise<void> {
  const rule = await db.recurring.get(id);
  if (!rule) return;
  // Turning back on never back-fills the months it was off.
  const startMonth = enabled ? (compareMonths(parseMonthKey(rule.startMonth)!, parseMonthKey(defaultStartMonth(rule.dayOfMonth, now))!) < 0 ? defaultStartMonth(rule.dayOfMonth, now) : rule.startMonth) : rule.startMonth;
  await db.recurring.update(id, { enabled, startMonth });
}

export async function deleteRecurringIncome(id: number): Promise<void> {
  await db.recurring.delete(id);
}

/** Create any due entries. Returns the ids of new transactions. */
export async function runRecurringIncome(now: Date = new Date()): Promise<number[]> {
  const rules = (await db.recurring.toArray()).filter((r) => r.enabled);
  const created: number[] = [];
  const current = yearMonthOf(now);

  for (const rule of rules) {
    const start = parseMonthKey(rule.startMonth);
    if (!start || !rule.id) continue;
    for (let ym = start; compareMonths(ym, current) <= 0; ym = addMonths(ym, 1)) {
      const date = occurrenceDate(rule, ym.year, ym.month);
      if (date.getTime() > now.getTime()) break;
      const key = recurringKey(rule.id, ym.year, ym.month);
      try {
        await db.transaction('rw', db.transactions, db.accounts, db.categories, async () => {
          if (await db.transactions.where('recurringKey').equals(key).first()) return;
          const [account, category] = [await db.accounts.get(rule.accountId), await db.categories.get(rule.categoryId)];
          if (!account || !category) return;
          created.push(
            (await db.transactions.add({
              type: 'income',
              amount: rule.amountPiastres,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              merchant: rule.name,
              note: 'Added automatically every month',
              date,
              createdAt: new Date(),
              recurringKey: key,
            })) as number
          );
        });
      } catch (err) {
        // A parallel run (another tab or the service worker) inserted it first.
        if ((err as { name?: string })?.name !== 'ConstraintError') throw err;
      }
    }
  }
  return created;
}
