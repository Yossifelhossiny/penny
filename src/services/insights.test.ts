import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  getCategorySpendingBreakdown,
  getMonthlyTrend,
  getFinancialHealthInsights,
} from './insights';
import { addIncome, addExpense, addTransfer } from './transactions';

describe('insights service', () => {
  let bankId: number;
  let cashId: number;
  let foodCatId: number;
  let shoppingCatId: number;
  let salaryCatId: number;

  beforeEach(async () => {
    await db.accounts.clear();
    await db.transactions.clear();
    await db.categories.clear();

    bankId = (await db.accounts.add({
      name: 'Bank',
      type: 'bank',
      openingBalance: 10_000_00,
      color: '#3b82f6',
      icon: '🏦',
      createdAt: new Date(),
    })) as number;

    cashId = (await db.accounts.add({
      name: 'Cash',
      type: 'cash',
      openingBalance: 1_000_00,
      color: '#10b981',
      icon: '💵',
      createdAt: new Date(),
    })) as number;

    foodCatId = (await db.categories.add({
      name: 'Food & Drinks',
      icon: '🍔',
      type: 'expense',
      color: '#f59e0b',
    })) as number;

    shoppingCatId = (await db.categories.add({
      name: 'Shopping',
      icon: '🛒',
      type: 'expense',
      color: '#ec4899',
    })) as number;

    salaryCatId = (await db.categories.add({
      name: 'Salary',
      icon: '💰',
      type: 'income',
      color: '#10b981',
    })) as number;
  });

  describe('getCategorySpendingBreakdown', () => {
    it('aggregates expenses by category and computes correct percentages', async () => {
      const year = 2026;
      const month = 10; // November

      // Food: 600 EGP (60000 piastres)
      await addExpense({
        amount: 400_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(year, month, 5),
      });
      await addExpense({
        amount: 200_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(year, month, 10),
      });

      // Shopping: 400 EGP (40000 piastres)
      await addExpense({
        amount: 400_00,
        accountId: bankId,
        categoryId: shoppingCatId,
        date: new Date(year, month, 12),
      });

      // Transfers should NOT be included in category expenses
      await addTransfer({
        amount: 1000_00,
        fromAccountId: bankId,
        toAccountId: cashId,
        date: new Date(year, month, 15),
      });

      const breakdown = await getCategorySpendingBreakdown(year, month);
      expect(breakdown.length).toBe(2);

      // Total expenses = 1000 EGP. Food = 60%, Shopping = 40%
      expect(breakdown[0].name).toBe('Food & Drinks');
      expect(breakdown[0].amountPiastres).toBe(600_00);
      expect(breakdown[0].percentage).toBe(60);

      expect(breakdown[1].name).toBe('Shopping');
      expect(breakdown[1].amountPiastres).toBe(400_00);
      expect(breakdown[1].percentage).toBe(40);
    });

    it('returns empty array when there are no expenses in the period', async () => {
      const breakdown = await getCategorySpendingBreakdown(2025, 0);
      expect(breakdown).toEqual([]);
    });
  });

  describe('getMonthlyTrend', () => {
    it('returns monthly comparisons across requested months', async () => {
      // Add transactions across different months
      // Oct 2026 (Month 9): Income 5000, Expense 2000 -> Net 3000
      await addIncome({
        amount: 5000_00,
        accountId: bankId,
        categoryId: salaryCatId,
        date: new Date(2026, 9, 1),
      });
      await addExpense({
        amount: 2000_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(2026, 9, 15),
      });

      // Nov 2026 (Month 10): Income 6000, Expense 1500 -> Net 4500
      await addIncome({
        amount: 6000_00,
        accountId: bankId,
        categoryId: salaryCatId,
        date: new Date(2026, 10, 1),
      });
      await addExpense({
        amount: 1500_00,
        accountId: bankId,
        categoryId: shoppingCatId,
        date: new Date(2026, 10, 15),
      });

      const trend = await getMonthlyTrend(3, 2026, 10);
      expect(trend.length).toBe(3);

      const oct = trend.find(m => m.monthKey === '2026-10')!;
      expect(oct).toBeDefined();
      expect(oct.incomePiastres).toBe(5000_00);
      expect(oct.expensesPiastres).toBe(2000_00);
      expect(oct.netSavingsPiastres).toBe(3000_00);
      expect(oct.savingsRate).toBe(60);

      const nov = trend.find(m => m.monthKey === '2026-11')!;
      expect(nov).toBeDefined();
      expect(nov.incomePiastres).toBe(6000_00);
      expect(nov.expensesPiastres).toBe(1500_00);
      expect(nov.netSavingsPiastres).toBe(4500_00);
      expect(nov.savingsRate).toBe(75);
    });
  });

  describe('getFinancialHealthInsights', () => {
    it('computes savings rate, daily burn rate, and top category accurately', async () => {
      const year = 2026;
      const month = 10; // November

      await addIncome({
        amount: 10_000_00,
        accountId: bankId,
        categoryId: salaryCatId,
        date: new Date(year, month, 1),
      });

      await addExpense({
        amount: 2_500_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(year, month, 5),
      });

      await addExpense({
        amount: 500_00,
        accountId: bankId,
        categoryId: shoppingCatId,
        date: new Date(year, month, 8),
      });

      const insights = await getFinancialHealthInsights(year, month);
      expect(insights.incomePiastres).toBe(10_000_00);
      expect(insights.expensesPiastres).toBe(3_000_00);
      expect(insights.netSavingsPiastres).toBe(7_000_00);
      expect(insights.savingsRate).toBe(70); // 7,000 / 10,000 = 70%

      expect(insights.topCategory).not.toBeNull();
      expect(insights.topCategory!.name).toBe('Food & Drinks');
      expect(insights.topCategory!.amountPiastres).toBe(2_500_00);
      expect(insights.topCategory!.percentage).toBe(83.3);
    });
  });
});
