/**
 * Financial Reports Service
 *
 * Generates structured monthly and yearly financial statements,
 * category breakdowns, and account balances.
 */

import { db } from '../db';
import type { Category, Transaction } from '../types';

export interface AccountReportRow {
  accountId: number;
  name: string;
  type: string;
  icon: string;
  color: string;
  startingBalancePiastres: number;
  totalInPiastres: number;
  totalOutPiastres: number;
  endingBalancePiastres: number;
  netChangePiastres: number;
}

export interface CategoryReportRow {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  totalPiastres: number;
  percentage: number;
}

export interface PeriodFinancialReport {
  periodType: 'monthly' | 'yearly';
  label: string;
  year: number;
  month?: number;
  startDate: Date;
  endDate: Date;

  // High-level figures
  startingNetWorthPiastres: number;
  endingNetWorthPiastres: number;
  netWorthChangePiastres: number;

  totalIncomePiastres: number;
  totalExpensePiastres: number;
  totalTransferPiastres: number;
  savingsRate: number; // percentage

  // Category breakdown
  categoryBreakdown: CategoryReportRow[];

  // Account statement rows
  accountStatements: AccountReportRow[];

  // Key highlights
  largestExpense: {
    amountPiastres: number;
    merchant?: string;
    categoryName?: string;
    date: Date;
  } | null;
  dailyAverageExpensePiastres: number;
  transactionCount: number;
}

export async function generateFinancialReport(
  periodType: 'monthly' | 'yearly',
  year: number,
  month: number = 0
): Promise<PeriodFinancialReport> {
  const startDate = periodType === 'monthly'
    ? new Date(year, month, 1)
    : new Date(year, 0, 1);

  const endDate = periodType === 'monthly'
    ? new Date(year, month + 1, 0, 23, 59, 59, 999)
    : new Date(year, 11, 31, 23, 59, 59, 999);

  const label = periodType === 'monthly'
    ? `${startDate.toLocaleString('en', { month: 'long' })} ${year}`
    : `Year ${year}`;

  const [accounts, categories, allTxnsBeforeEnd] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.where('date').belowOrEqual(endDate).toArray(),
  ]);

  const categoryMap = new Map<number, Category>();
  categories.forEach((c) => categoryMap.set(c.id!, c));

  // Partition transactions into:
  // 1. prior to period (before startDate)
  // 2. during period (between startDate and endDate)
  const priorTxns: Transaction[] = [];
  const periodTxns: Transaction[] = [];

  for (const t of allTxnsBeforeEnd) {
    if (t.date < startDate) {
      priorTxns.push(t);
    } else {
      periodTxns.push(t);
    }
  }

  // Helper to compute balance map given a set of transactions
  function computeBalancesAt(txns: Transaction[]): Map<number, number> {
    const balances = new Map<number, number>();
    for (const a of accounts) {
      balances.set(a.id!, a.openingBalance);
    }
    for (const t of txns) {
      const cur = balances.get(t.accountId) ?? 0;
      if (t.type === 'income') {
        balances.set(t.accountId, cur + t.amount);
      } else if (t.type === 'expense') {
        balances.set(t.accountId, cur - t.amount);
      } else if (t.type === 'transfer') {
        balances.set(t.accountId, cur - t.amount);
        const dest = balances.get(t.toAccountId!) ?? 0;
        balances.set(t.toAccountId!, dest + t.amount);
      }
    }
    return balances;
  }

  const startingBalanceMap = computeBalancesAt(priorTxns);
  const endingBalanceMap = computeBalancesAt(allTxnsBeforeEnd);

  const startingNetWorthPiastres = Array.from(startingBalanceMap.values()).reduce(
    (sum, b) => sum + b,
    0
  );
  const endingNetWorthPiastres = Array.from(endingBalanceMap.values()).reduce(
    (sum, b) => sum + b,
    0
  );
  const netWorthChangePiastres = endingNetWorthPiastres - startingNetWorthPiastres;

  // Period totals
  let totalIncomePiastres = 0;
  let totalExpensePiastres = 0;
  let totalTransferPiastres = 0;
  let largestExpenseTxn: Transaction | null = null;

  const categoryTotals = new Map<number, number>();

  for (const t of periodTxns) {
    if (t.type === 'income') {
      totalIncomePiastres += t.amount;
    } else if (t.type === 'expense') {
      totalExpensePiastres += t.amount;
      const catId = t.categoryId ?? 0;
      categoryTotals.set(catId, (categoryTotals.get(catId) ?? 0) + t.amount);

      if (!largestExpenseTxn || t.amount > largestExpenseTxn.amount) {
        largestExpenseTxn = t;
      }
    } else if (t.type === 'transfer') {
      totalTransferPiastres += t.amount;
    }
  }

  const savingsRate = totalIncomePiastres > 0
    ? Math.round(((totalIncomePiastres - totalExpensePiastres) / totalIncomePiastres) * 1000) / 10
    : 0;

  // Category breakdown
  const categoryBreakdown: CategoryReportRow[] = [];
  for (const [catId, total] of categoryTotals.entries()) {
    const cat = categoryMap.get(catId);
    const pct = totalExpensePiastres > 0
      ? Math.round((total / totalExpensePiastres) * 1000) / 10
      : 0;

    categoryBreakdown.push({
      categoryId: catId,
      name: cat?.name ?? 'Uncategorized',
      icon: cat?.icon ?? '📦',
      color: cat?.color ?? '#64748b',
      totalPiastres: total,
      percentage: pct,
    });
  }
  categoryBreakdown.sort((a, b) => b.totalPiastres - a.totalPiastres);

  // Account statement rows
  const accountStatements: AccountReportRow[] = [];

  for (const acc of accounts) {
    const accId = acc.id!;
    const startBal = startingBalanceMap.get(accId) ?? acc.openingBalance;
    const endBal = endingBalanceMap.get(accId) ?? acc.openingBalance;

    let accIn = 0;
    let accOut = 0;

    for (const t of periodTxns) {
      if (t.type === 'income' && t.accountId === accId) {
        accIn += t.amount;
      } else if (t.type === 'expense' && t.accountId === accId) {
        accOut += t.amount;
      } else if (t.type === 'transfer') {
        if (t.accountId === accId) accOut += t.amount;
        if (t.toAccountId === accId) accIn += t.amount;
      }
    }

    accountStatements.push({
      accountId: accId,
      name: acc.name,
      type: acc.type,
      icon: acc.icon,
      color: acc.color,
      startingBalancePiastres: startBal,
      totalInPiastres: accIn,
      totalOutPiastres: accOut,
      endingBalancePiastres: endBal,
      netChangePiastres: endBal - startBal,
    });
  }

  // Days in period
  const msInDay = 1000 * 60 * 60 * 24;
  const daysInPeriod = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / msInDay));
  const dailyAverageExpensePiastres = Math.round(totalExpensePiastres / daysInPeriod);

  return {
    periodType,
    label,
    year,
    month: periodType === 'monthly' ? month : undefined,
    startDate,
    endDate,
    startingNetWorthPiastres,
    endingNetWorthPiastres,
    netWorthChangePiastres,
    totalIncomePiastres,
    totalExpensePiastres,
    totalTransferPiastres,
    savingsRate,
    categoryBreakdown,
    accountStatements,
    largestExpense: largestExpenseTxn
      ? {
          amountPiastres: largestExpenseTxn.amount,
          merchant: largestExpenseTxn.merchant,
          categoryName: largestExpenseTxn.categoryId
            ? categoryMap.get(largestExpenseTxn.categoryId)?.name
            : undefined,
          date: largestExpenseTxn.date,
        }
      : null,
    dailyAverageExpensePiastres,
    transactionCount: periodTxns.length,
  };
}
