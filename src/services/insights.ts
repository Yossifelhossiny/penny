/**
 * Financial Insights & Analytics Service
 *
 * Computes category breakdowns, multi-month trends,
 * cash flow metrics, and actionable financial health insights.
 *
 * All amounts are computed in integer piastres, converted to
 * human-readable numbers for charting.
 */

import { db } from '../db';
import type { Category } from '../types';

export interface CategorySpendingItem {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  amountPiastres: number;
  amountEgp: number;
  percentage: number; // 0 to 100
}

export interface MonthSummaryItem {
  monthKey: string; // "2026-11"
  label: string; // "Nov 2026" or "Nov"
  year: number;
  month: number; // 0-indexed
  incomePiastres: number;
  incomeEgp: number;
  expensesPiastres: number;
  expensesEgp: number;
  netSavingsPiastres: number;
  netSavingsEgp: number;
  savingsRate: number; // percentage
}

export interface FinancialHealthInsights {
  incomePiastres: number;
  expensesPiastres: number;
  netSavingsPiastres: number;
  savingsRate: number; // 0-100%
  averageDailyBurnPiastres: number;
  topCategory: {
    name: string;
    icon: string;
    amountPiastres: number;
    percentage: number;
  } | null;
  previousMonthComparison: {
    incomeChangePct: number | null;
    expenseChangePct: number | null;
  };
}

/**
 * Get spending breakdown grouped by category for a specific month and year.
 */
export async function getCategorySpendingBreakdown(
  year: number,
  month: number
): Promise<CategorySpendingItem[]> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const [transactions, categories] = await Promise.all([
    db.transactions
      .where('date')
      .between(start, end, true, true)
      .filter((t) => t.type === 'expense')
      .toArray(),
    db.categories.toArray(),
  ]);

  const categoryMap = new Map<number, Category>();
  categories.forEach((c) => categoryMap.set(c.id!, c));

  const totalExpensePiastres = transactions.reduce((sum, t) => sum + t.amount, 0);

  // Group by categoryId
  const spendingMap = new Map<number, number>();
  for (const t of transactions) {
    const catId = t.categoryId ?? 0;
    spendingMap.set(catId, (spendingMap.get(catId) ?? 0) + t.amount);
  }

  const items: CategorySpendingItem[] = [];

  for (const [catId, amountPiastres] of spendingMap.entries()) {
    const cat = categoryMap.get(catId);
    const percentage = totalExpensePiastres > 0
      ? Math.round((amountPiastres / totalExpensePiastres) * 1000) / 10
      : 0;

    items.push({
      categoryId: catId,
      name: cat?.name ?? 'Uncategorized',
      icon: cat?.icon ?? '❓',
      color: cat?.color ?? '#94a3b8',
      amountPiastres,
      amountEgp: amountPiastres / 100,
      percentage,
    });
  }

  // Sort descending by amount
  return items.sort((a, b) => b.amountPiastres - a.amountPiastres);
}

/**
 * Get monthly totals comparison over the past N months.
 */
export async function getMonthlyTrend(
  monthsCount: number = 6,
  endYear?: number,
  endMonth?: number
): Promise<MonthSummaryItem[]> {
  const now = new Date();
  const targetYear = endYear ?? now.getFullYear();
  const targetMonth = endMonth ?? now.getMonth();

  const results: MonthSummaryItem[] = [];

  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(targetYear, targetMonth - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();

    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);

    const monthTxns = await db.transactions
      .where('date')
      .between(start, end, true, true)
      .toArray();

    let incomePiastres = 0;
    let expensesPiastres = 0;

    for (const t of monthTxns) {
      if (t.type === 'income') incomePiastres += t.amount;
      else if (t.type === 'expense') expensesPiastres += t.amount;
    }

    const netSavingsPiastres = incomePiastres - expensesPiastres;
    const savingsRate = incomePiastres > 0
      ? Math.round((netSavingsPiastres / incomePiastres) * 1000) / 10
      : 0;

    const monthKey = `${y}-${(m + 1).toString().padStart(2, '0')}`;
    const label = d.toLocaleString('en', { month: 'short' });

    results.push({
      monthKey,
      label,
      year: y,
      month: m,
      incomePiastres,
      incomeEgp: incomePiastres / 100,
      expensesPiastres,
      expensesEgp: expensesPiastres / 100,
      netSavingsPiastres,
      netSavingsEgp: netSavingsPiastres / 100,
      savingsRate,
    });
  }

  return results;
}

/**
 * Get overall financial health and summary metrics for a given month.
 */
export async function getFinancialHealthInsights(
  year: number,
  month: number
): Promise<FinancialHealthInsights> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const [currentTxns, categoryBreakdown] = await Promise.all([
    db.transactions
      .where('date')
      .between(start, end, true, true)
      .toArray(),
    getCategorySpendingBreakdown(year, month),
  ]);

  let incomePiastres = 0;
  let expensesPiastres = 0;

  for (const t of currentTxns) {
    if (t.type === 'income') incomePiastres += t.amount;
    else if (t.type === 'expense') expensesPiastres += t.amount;
  }

  const netSavingsPiastres = incomePiastres - expensesPiastres;
  const savingsRate = incomePiastres > 0
    ? Math.round((netSavingsPiastres / incomePiastres) * 1000) / 10
    : 0;

  // Days in month up to today (or all days if looking at a past month)
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
  const daysElapsed = isCurrentMonth
    ? Math.max(1, now.getDate())
    : new Date(year, month + 1, 0).getDate();

  const averageDailyBurnPiastres = Math.round(expensesPiastres / daysElapsed);

  // Top spending category
  const topCat = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;
  const topCategory = topCat
    ? {
        name: topCat.name,
        icon: topCat.icon,
        amountPiastres: topCat.amountPiastres,
        percentage: topCat.percentage,
      }
    : null;

  // Compare with previous month
  const prevDate = new Date(year, month - 1, 1);
  const prevStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1);
  const prevEnd = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const prevTxns = await db.transactions
    .where('date')
    .between(prevStart, prevEnd, true, true)
    .toArray();

  let prevIncome = 0;
  let prevExpenses = 0;

  for (const t of prevTxns) {
    if (t.type === 'income') prevIncome += t.amount;
    else if (t.type === 'expense') prevExpenses += t.amount;
  }

  const incomeChangePct = prevIncome > 0
    ? Math.round(((incomePiastres - prevIncome) / prevIncome) * 1000) / 10
    : null;

  const expenseChangePct = prevExpenses > 0
    ? Math.round(((expensesPiastres - prevExpenses) / prevExpenses) * 1000) / 10
    : null;

  return {
    incomePiastres,
    expensesPiastres,
    netSavingsPiastres,
    savingsRate,
    averageDailyBurnPiastres,
    topCategory,
    previousMonthComparison: {
      incomeChangePct,
      expenseChangePct,
    },
  };
}
