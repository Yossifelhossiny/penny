import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, seedDefaults } from '../db';
import {
  addMonths, monthRange, monthsOfYear, monthsEndingAt, isInMonth, monthKey, parseMonthKey,
  normalizeYearMonth, daysElapsedInMonth, asDate,
} from '../utils/months';
import { getYearMonthlyTotals, getRecentMonthlyTotals, getMonthTransactions, getActiveYears } from './periods';
import { getMonthlyTotals } from './transactions';
import { getMonthlyTrend, getCategorySpendingBreakdown, getFinancialHealthInsights } from './insights';
import { generateFinancialReport } from './reports';
import { getOverallBudgetProgress, setBudget } from './budgets';
import { findMisdatedTransactions, applyDateSuggestions } from './dateAudit';

describe('month arithmetic', () => {
  it('normalizes overflow both ways', () => {
    expect(normalizeYearMonth(2026, 12)).toEqual({ year: 2027, month: 0 });
    expect(normalizeYearMonth(2026, -1)).toEqual({ year: 2025, month: 11 });
    expect(normalizeYearMonth(2026, -13)).toEqual({ year: 2024, month: 11 });
    expect(addMonths({ year: 2026, month: 10 }, 1)).toEqual({ year: 2026, month: 11 });
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('never skips a month when stepping from the 31st (the setMonth trap)', () => {
    let ym = { year: 2026, month: 0 };
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) { seen.push(monthKey(ym.year, ym.month)); ym = addMonths(ym, 1); }
    expect(seen).toEqual(['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02']);
  });

  it('every month of a year has the right length and contiguous boundaries', () => {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    monthsOfYear(2026).forEach(({ year, month }, i) => {
      const r = monthRange(year, month);
      expect(r.start).toEqual(new Date(2026, i, 1));
      expect(r.next).toEqual(new Date(2026, i + 1, 1));
      expect(r.end.getTime()).toBe(r.next.getTime() - 1);
      expect(r.end.getDate()).toBe(lengths[i]);
    });
    expect(monthRange(2028, 1).end.getDate()).toBe(29); // leap year
  });

  it('month boundaries at local midnight (Cairo)', () => {
    expect(isInMonth(new Date(2026, 10, 30, 23, 59, 59, 999), 2026, 10)).toBe(true);
    expect(isInMonth(new Date(2026, 11, 1, 0, 0, 0, 0), 2026, 10)).toBe(false);
    expect(isInMonth(new Date(2026, 11, 1, 0, 0, 0, 0), 2026, 11)).toBe(true);
    expect(isInMonth(new Date(2026, 10, 1, 0, 0), 2026, 10)).toBe(true);
    expect(isInMonth(new Date(2026, 9, 31, 23, 59), 2026, 10)).toBe(false);
  });

  it('Egypt DST months keep exact calendar boundaries', () => {
    // Egypt switches clocks in late April and late October.
    for (const m of [3, 4, 9, 10]) {
      const r = monthRange(2026, m);
      expect(r.start.getDate()).toBe(1);
      expect(r.start.getHours()).toBe(0);
      expect(r.next.getDate()).toBe(1);
    }
  });

  it('keys, windows and elapsed days', () => {
    expect(parseMonthKey('2026-11')).toEqual({ year: 2026, month: 10 });
    expect(parseMonthKey('2026-13')).toBeNull();
    expect(monthsEndingAt({ year: 2027, month: 1 }, 4).map(m => monthKey(m.year, m.month))).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    const now = new Date(2026, 10, 26, 15);
    expect(daysElapsedInMonth(2026, 10, now)).toBe(26);
    expect(daysElapsedInMonth(2026, 9, now)).toBe(31);
    expect(daysElapsedInMonth(2026, 11, now)).toBe(0);
    expect(asDate('2026-11-26T10:00:00Z')).toBeInstanceOf(Date);
    expect(asDate('nope')).toBeNull();
  });
});

describe('monthly data across screens', () => {
  let bankId: number;
  let catId: number;

  async function add(type: 'income' | 'expense', amountEgp: number, date: Date, extra: Record<string, unknown> = {}) {
    return db.transactions.add({
      type, amount: amountEgp * 100, accountId: bankId, categoryId: catId, date, createdAt: date, ...extra,
    } as never);
  }

  beforeEach(async () => {
    await Promise.all([db.accounts.clear(), db.transactions.clear(), db.categories.clear(), db.budgets.clear(), db.goals.clear()]);
    await seedDefaults();
    bankId = (await db.accounts.toArray()).find(a => a.type === 'bank')!.id!;
    catId = (await db.categories.toArray()).find(c => c.type === 'expense')!.id!;
  });

  it('returns all 12 months, including empty ones, with November present', async () => {
    await add('income', 1000, new Date(2026, 0, 15));
    await add('expense', 200, new Date(2026, 10, 1, 0, 0));      // first instant of Nov
    await add('expense', 300, new Date(2026, 10, 30, 23, 59));   // last minute of Nov
    await add('expense', 50, new Date(2026, 11, 1, 0, 0));       // first instant of Dec
    await add('expense', 70, new Date(2026, 9, 31, 23, 59, 59)); // last second of Oct

    const year = await getYearMonthlyTotals(2026);
    expect(year.map(m => m.shortLabel)).toEqual(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']);
    expect(year[10]).toMatchObject({ key: '2026-11', expensesPiastres: 50_000, transactionCount: 2 });
    expect(year[9].expensesPiastres).toBe(7_000);
    expect(year[11].expensesPiastres).toBe(5_000);
    expect(year[1]).toMatchObject({ incomePiastres: 0, expensesPiastres: 0, transactionCount: 0 });
  });

  it('dashboard, trend, insights, budgets and reports agree on November', async () => {
    await add('income', 5000, new Date(2026, 10, 2, 9));
    await add('expense', 1200, new Date(2026, 10, 15, 13));
    await add('expense', 300, new Date(2026, 10, 30, 23, 59, 59));
    await setBudget({ categoryId: 0, limitPiastres: 2_000_00 });

    const totals = await getMonthlyTotals(2026, 10);
    const trend = (await getMonthlyTrend(6, 2026, 10)).at(-1)!;
    const health = await getFinancialHealthInsights(2026, 10);
    const cats = await getCategorySpendingBreakdown(2026, 10);
    const report = await generateFinancialReport('monthly', 2026, 10);
    const budget = await getOverallBudgetProgress(2026, 10);

    expect(totals).toEqual({ income: 5000_00, expenses: 1500_00 });
    expect(trend).toMatchObject({ monthKey: '2026-11', incomePiastres: 5000_00, expensesPiastres: 1500_00 });
    expect(health).toMatchObject({ incomePiastres: 5000_00, expensesPiastres: 1500_00 });
    expect(cats.reduce((s, c) => s + c.amountPiastres, 0)).toBe(1500_00);
    expect(report).toMatchObject({ totalIncomePiastres: 5000_00, totalExpensePiastres: 1500_00, transactionCount: 3 });
    expect(budget?.totalSpentPiastres).toBe(1500_00);
  });

  it('trend windows cross the year boundary', async () => {
    await add('expense', 10, new Date(2026, 11, 31, 23, 59));
    await add('expense', 20, new Date(2027, 0, 1, 0, 0));
    const t = await getRecentMonthlyTotals({ year: 2027, month: 1 }, 3);
    expect(t.map(m => [m.key, m.expensesPiastres])).toEqual([['2026-12', 1000], ['2027-01', 2000], ['2027-02', 0]]);
  });

  it('finds records whose date was stored as a string', async () => {
    await add('expense', 99, '2026-11-20T10:00:00.000Z' as never);
    expect((await getMonthTransactions(2026, 10)).map(t => t.amount)).toEqual([9900]);
    expect((await getYearMonthlyTotals(2026))[10].expensesPiastres).toBe(9900);
  });

  it('active years include the current year and data years', async () => {
    await add('expense', 1, new Date(2024, 5, 1));
    expect(await getActiveYears(new Date(2026, 10, 26))).toEqual([2026, 2025, 2024]);
  });

  it('suggests (but does not apply) a fix for November SMS saved as February 2027', async () => {
    const sms = 'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 5.00 جم إلى MOHAB E****** رقم مرجعي 287630553655 يوم 26-11 الساعة 14:59';
    const importedAt = new Date(2026, 10, 26, 15, 0);
    const id = await add('expense', 5, new Date(2027, 1, 11, 14, 59), { originalSms: sms, createdAt: importedAt });
    await add('expense', 7, new Date(2026, 10, 20), { originalSms: 'تم خصم 7.00EGP يوم 20/11', createdAt: new Date(2026, 10, 20) });

    const s = await findMisdatedTransactions();
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id, reason: 'future' });
    expect(s[0].suggestedDate).toEqual(new Date(2026, 10, 26, 14, 59));
    // untouched until confirmed
    expect((await db.transactions.get(id))!.date).toEqual(new Date(2027, 1, 11, 14, 59));

    await applyDateSuggestions(s);
    const fixed = (await db.transactions.get(id))!;
    expect(fixed.date).toEqual(new Date(2026, 10, 26, 14, 59));
    expect(fixed.amount).toBe(500);
    expect((await getYearMonthlyTotals(2026))[10].expensesPiastres).toBe(1200);
  });
});
