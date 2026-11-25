import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  setBudget,
  deleteBudget,
  getBudgetsWithProgress,
  getOverallBudgetProgress,
  getActiveSpendingAlerts,
  createSavingsGoal,
  contributeToSavingsGoal,
  getSavingsGoalsWithProgress,
  deleteSavingsGoal,
} from './budgets';
import { addExpense } from './transactions';

describe('budgets & goals service', () => {
  let bankId: number;
  let foodCatId: number;
  let shoppingCatId: number;

  beforeEach(async () => {
    await db.accounts.clear();
    await db.transactions.clear();
    await db.categories.clear();
    await db.budgets.clear();
    await db.goals.clear();

    bankId = (await db.accounts.add({
      name: 'Bank Account',
      type: 'bank',
      openingBalance: 10_000_00,
      color: '#3b82f6',
      icon: '🏦',
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
  });

  describe('Budgets Management', () => {
    it('sets and updates budget limits', async () => {
      // Set food budget: 1,000 EGP (100000 piastres)
      const id = await setBudget({
        categoryId: foodCatId,
        limitPiastres: 1000_00,
      });

      const budget = await db.budgets.get(id);
      expect(budget).toBeDefined();
      expect(budget!.limitPiastres).toBe(1000_00);

      // Updating same category should update existing budget record
      const updatedId = await setBudget({
        categoryId: foodCatId,
        limitPiastres: 1500_00,
      });
      expect(updatedId).toBe(id);
      expect((await db.budgets.get(id))!.limitPiastres).toBe(1500_00);
      expect(await db.budgets.count()).toBe(1);
    });

    it('deletes budget', async () => {
      const id = await setBudget({
        categoryId: foodCatId,
        limitPiastres: 1000_00,
      });
      await deleteBudget(id);
      expect(await db.budgets.get(id)).toBeUndefined();
    });

    it('computes budget progress and statuses (safe, warning, exceeded)', async () => {
      const year = 2026;
      const month = 10; // November

      // Food budget: 1,000 EGP
      await setBudget({
        categoryId: foodCatId,
        limitPiastres: 1000_00,
      });

      // Shopping budget: 500 EGP
      await setBudget({
        categoryId: shoppingCatId,
        limitPiastres: 500_00,
      });

      // 1. Food: 850 EGP spent (85% -> warning)
      await addExpense({
        amount: 850_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(year, month, 5),
      });

      // 2. Shopping: 600 EGP spent (120% -> exceeded)
      await addExpense({
        amount: 600_00,
        accountId: bankId,
        categoryId: shoppingCatId,
        date: new Date(year, month, 8),
      });

      const progressList = await getBudgetsWithProgress(year, month);
      expect(progressList.length).toBe(2);

      const foodProgress = progressList.find((p) => p.categoryId === foodCatId)!;
      expect(foodProgress).toBeDefined();
      expect(foodProgress.spentPiastres).toBe(850_00);
      expect(foodProgress.remainingPiastres).toBe(150_00);
      expect(foodProgress.percentage).toBe(85);
      expect(foodProgress.status).toBe('warning');

      const shoppingProgress = progressList.find((p) => p.categoryId === shoppingCatId)!;
      expect(shoppingProgress).toBeDefined();
      expect(shoppingProgress.spentPiastres).toBe(600_00);
      expect(shoppingProgress.remainingPiastres).toBe(-100_00);
      expect(shoppingProgress.percentage).toBe(120);
      expect(shoppingProgress.status).toBe('exceeded');
    });

    it('computes overall budget progress accurately', async () => {
      const year = 2026;
      const month = 10;

      // Custom overall budget: 3,000 EGP
      await setBudget({
        categoryId: 0,
        limitPiastres: 3000_00,
      });

      await addExpense({
        amount: 1200_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(year, month, 2),
      });

      const overall = await getOverallBudgetProgress(year, month);
      expect(overall).not.toBeNull();
      expect(overall!.totalLimitPiastres).toBe(3000_00);
      expect(overall!.totalSpentPiastres).toBe(1200_00);
      expect(overall!.remainingPiastres).toBe(1800_00);
      expect(overall!.percentage).toBe(40);
      expect(overall!.status).toBe('safe');
      expect(overall!.isCustomOverall).toBe(true);
    });

    it('generates spending alerts for near-limit and exceeded budgets', async () => {
      const year = 2026;
      const month = 10;

      await setBudget({
        categoryId: foodCatId,
        limitPiastres: 1000_00,
      });

      // 950 EGP spent (95% -> warning alert)
      await addExpense({
        amount: 950_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(year, month, 10),
      });

      const alerts = await getActiveSpendingAlerts(year, month);
      expect(alerts.length).toBeGreaterThan(0);
      const foodAlert = alerts.find((a) => a.categoryId === foodCatId)!;
      expect(foodAlert).toBeDefined();
      expect(foodAlert.type).toBe('warning');
      expect(foodAlert.percentage).toBe(95);
    });
  });

  describe('Savings Goals', () => {
    it('creates, contributes to, and tracks savings goals', async () => {
      const goalId = await createSavingsGoal({
        name: 'Emergency Fund',
        targetAmountPiastres: 50_000_00, // 50,000 EGP
        currentAmountPiastres: 10_000_00, // 10,000 EGP
        icon: '🛡️',
        color: '#10b981',
      });

      let goals = await getSavingsGoalsWithProgress();
      expect(goals.length).toBe(1);
      expect(goals[0].name).toBe('Emergency Fund');
      expect(goals[0].percentage).toBe(20);
      expect(goals[0].remainingPiastres).toBe(40_000_00);
      expect(goals[0].isCompleted).toBe(false);

      // Contribute 40,000 EGP to complete goal
      await contributeToSavingsGoal(goalId, 40_000_00);

      goals = await getSavingsGoalsWithProgress();
      expect(goals[0].currentAmountPiastres).toBe(50_000_00);
      expect(goals[0].percentage).toBe(100);
      expect(goals[0].isCompleted).toBe(true);
      expect(goals[0].remainingPiastres).toBe(0);

      // Delete goal
      await deleteSavingsGoal(goalId);
      expect(await db.goals.count()).toBe(0);
    });
  });
});
