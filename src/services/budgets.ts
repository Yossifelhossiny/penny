/**
 * Budgets & Savings Goals Service
 *
 * Manages monthly category limits, overall spending ceilings,
 * real-time progress calculations, spending warnings, and savings goals.
 *
 * All amounts are stored and calculated in integer piastres.
 */

import { db } from '../db';
import type { Budget, SavingsGoal, Category } from '../types';

export interface BudgetProgress {
  id: number;
  categoryId: number;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  limitPiastres: number;
  spentPiastres: number;
  remainingPiastres: number;
  percentage: number; // 0 to 100+
  status: 'safe' | 'warning' | 'exceeded';
  monthKey?: string | null;
}

export interface OverallBudgetProgress {
  totalLimitPiastres: number;
  totalSpentPiastres: number;
  remainingPiastres: number;
  percentage: number;
  status: 'safe' | 'warning' | 'exceeded';
  isCustomOverall: boolean;
}

export interface SpendingAlert {
  type: 'warning' | 'exceeded';
  categoryId: number;
  title: string;
  message: string;
  icon: string;
  percentage: number;
  spentPiastres: number;
  limitPiastres: number;
  remainingPiastres: number;
}

export interface GoalProgress {
  id: number;
  name: string;
  targetAmountPiastres: number;
  currentAmountPiastres: number;
  remainingPiastres: number;
  percentage: number; // 0 - 100
  isCompleted: boolean;
  targetDate?: Date | null;
  daysRemaining?: number | null;
  icon: string;
  color: string;
  createdAt: Date;
}

/**
 * Format a year and month (0-indexed) to monthKey string "YYYY-MM".
 */
export function toMonthKey(year: number, month: number): string {
  return `${year}-${(month + 1).toString().padStart(2, '0')}`;
}

/**
 * Set or update a budget limit.
 * categoryId = 0 denotes overall monthly budget.
 */
export async function setBudget(input: {
  categoryId: number;
  limitPiastres: number;
  monthKey?: string | null;
}): Promise<number> {
  if (!Number.isInteger(input.limitPiastres) || input.limitPiastres <= 0) {
    throw new Error('Budget limit must be a positive integer in piastres');
  }

  const monthKey = input.monthKey || null;

  // Check if budget exists for category + monthKey
  const existing = await db.budgets
    .filter((b) => b.categoryId === input.categoryId && (b.monthKey || null) === monthKey)
    .first();

  if (existing && existing.id) {
    await db.budgets.update(existing.id, {
      limitPiastres: input.limitPiastres,
    });
    return existing.id;
  }

  const newBudget: Budget = {
    categoryId: input.categoryId,
    limitPiastres: input.limitPiastres,
    monthKey,
    createdAt: new Date(),
  };

  const id = await db.budgets.add(newBudget);
  return id as number;
}

/**
 * Delete a budget.
 */
export async function deleteBudget(id: number): Promise<void> {
  await db.budgets.delete(id);
}

/**
 * Get category budgets along with their actual spent progress for a given month.
 */
export async function getBudgetsWithProgress(
  year: number,
  month: number
): Promise<BudgetProgress[]> {
  const currentMonthKey = toMonthKey(year, month);
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const [allBudgets, monthExpenses, categories] = await Promise.all([
    db.budgets.toArray(),
    db.transactions
      .where('date')
      .between(start, end, true, true)
      .filter((t) => t.type === 'expense')
      .toArray(),
    db.categories.toArray(),
  ]);

  const categoryMap = new Map<number, Category>();
  categories.forEach((c) => categoryMap.set(c.id!, c));

  // Compute spent per category
  const spentMap = new Map<number, number>();
  for (const t of monthExpenses) {
    const catId = t.categoryId ?? 0;
    spentMap.set(catId, (spentMap.get(catId) ?? 0) + t.amount);
  }

  // Filter budgets applicable to this month: specific monthKey takes precedence over recurring (null)
  const categoryBudgets = allBudgets.filter((b) => b.categoryId > 0);
  const resolvedBudgets = new Map<number, Budget>();

  for (const b of categoryBudgets) {
    if (b.monthKey === currentMonthKey) {
      resolvedBudgets.set(b.categoryId, b);
    } else if (!b.monthKey && !resolvedBudgets.has(b.categoryId)) {
      resolvedBudgets.set(b.categoryId, b);
    }
  }

  const results: BudgetProgress[] = [];

  for (const [catId, budget] of resolvedBudgets.entries()) {
    const cat = categoryMap.get(catId);
    const spentPiastres = spentMap.get(catId) ?? 0;
    const limitPiastres = budget.limitPiastres;
    const remainingPiastres = limitPiastres - spentPiastres;

    const percentage = limitPiastres > 0
      ? Math.round((spentPiastres / limitPiastres) * 100)
      : 0;

    let status: BudgetProgress['status'] = 'safe';
    if (percentage > 100) status = 'exceeded';
    else if (percentage >= 80) status = 'warning';

    results.push({
      id: budget.id!,
      categoryId: catId,
      categoryName: cat?.name ?? 'Category',
      categoryIcon: cat?.icon ?? '📦',
      categoryColor: cat?.color ?? '#64748b',
      limitPiastres,
      spentPiastres,
      remainingPiastres,
      percentage,
      status,
      monthKey: budget.monthKey,
    });
  }

  // Sort: exceeded first, then warning, then safe
  return results.sort((a, b) => b.percentage - a.percentage);
}

/**
 * Get overall monthly budget progress (custom overall budget or sum of category limits).
 */
export async function getOverallBudgetProgress(
  year: number,
  month: number
): Promise<OverallBudgetProgress | null> {
  const currentMonthKey = toMonthKey(year, month);
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const [allBudgets, monthExpenses, categoryProgressList] = await Promise.all([
    db.budgets.toArray(),
    db.transactions
      .where('date')
      .between(start, end, true, true)
      .filter((t) => t.type === 'expense')
      .toArray(),
    getBudgetsWithProgress(year, month),
  ]);

  const totalSpentPiastres = monthExpenses.reduce((sum, t) => sum + t.amount, 0);

  // Check custom overall budget (categoryId === 0)
  const customOverall =
    allBudgets.find((b) => b.categoryId === 0 && b.monthKey === currentMonthKey) ||
    allBudgets.find((b) => b.categoryId === 0 && !b.monthKey);

  let totalLimitPiastres: number;
  let isCustomOverall = false;

  if (customOverall) {
    totalLimitPiastres = customOverall.limitPiastres;
    isCustomOverall = true;
  } else if (categoryProgressList.length > 0) {
    // Sum of all category budgets
    totalLimitPiastres = categoryProgressList.reduce((sum, b) => sum + b.limitPiastres, 0);
  } else {
    // No budgets set
    return null;
  }

  const remainingPiastres = totalLimitPiastres - totalSpentPiastres;
  const percentage = totalLimitPiastres > 0
    ? Math.round((totalSpentPiastres / totalLimitPiastres) * 100)
    : 0;

  let status: OverallBudgetProgress['status'] = 'safe';
  if (percentage > 100) status = 'exceeded';
  else if (percentage >= 80) status = 'warning';

  return {
    totalLimitPiastres,
    totalSpentPiastres,
    remainingPiastres,
    percentage,
    status,
    isCustomOverall,
  };
}

/**
 * Get active alerts for budgets that are >= 80% used or exceeded.
 */
export async function getActiveSpendingAlerts(
  year: number,
  month: number
): Promise<SpendingAlert[]> {
  const [categoryBudgets, overallProgress] = await Promise.all([
    getBudgetsWithProgress(year, month),
    getOverallBudgetProgress(year, month),
  ]);

  const alerts: SpendingAlert[] = [];

  // Check overall budget alert
  if (overallProgress && overallProgress.status !== 'safe') {
    if (overallProgress.status === 'exceeded') {
      alerts.push({
        type: 'exceeded',
        categoryId: 0,
        title: 'Overall Budget Exceeded',
        message: `Total spending has exceeded your monthly ceiling by ${(Math.abs(overallProgress.remainingPiastres) / 100).toFixed(2)} EGP.`,
        icon: '🚨',
        percentage: overallProgress.percentage,
        spentPiastres: overallProgress.totalSpentPiastres,
        limitPiastres: overallProgress.totalLimitPiastres,
        remainingPiastres: overallProgress.remainingPiastres,
      });
    } else {
      alerts.push({
        type: 'warning',
        categoryId: 0,
        title: 'Overall Budget Warning',
        message: `You have used ${overallProgress.percentage}% of your monthly budget. ${(overallProgress.remainingPiastres / 100).toFixed(2)} EGP remaining.`,
        icon: '⚠️',
        percentage: overallProgress.percentage,
        spentPiastres: overallProgress.totalSpentPiastres,
        limitPiastres: overallProgress.totalLimitPiastres,
        remainingPiastres: overallProgress.remainingPiastres,
      });
    }
  }

  // Check category budget alerts
  for (const b of categoryBudgets) {
    if (b.status === 'exceeded') {
      alerts.push({
        type: 'exceeded',
        categoryId: b.categoryId,
        title: `${b.categoryName} Budget Exceeded`,
        message: `Over limit by ${(Math.abs(b.remainingPiastres) / 100).toFixed(2)} EGP (${b.percentage}% used).`,
        icon: b.categoryIcon,
        percentage: b.percentage,
        spentPiastres: b.spentPiastres,
        limitPiastres: b.limitPiastres,
        remainingPiastres: b.remainingPiastres,
      });
    } else if (b.status === 'warning') {
      alerts.push({
        type: 'warning',
        categoryId: b.categoryId,
        title: `${b.categoryName} Near Limit`,
        message: `${b.percentage}% used. ${(b.remainingPiastres / 100).toFixed(2)} EGP remaining before cap.`,
        icon: b.categoryIcon,
        percentage: b.percentage,
        spentPiastres: b.spentPiastres,
        limitPiastres: b.limitPiastres,
        remainingPiastres: b.remainingPiastres,
      });
    }
  }

  return alerts;
}

// =========================================================
// Savings Goals
// =========================================================

export async function createSavingsGoal(input: {
  name: string;
  targetAmountPiastres: number;
  currentAmountPiastres?: number;
  targetDate?: Date | null;
  icon?: string;
  color?: string;
}): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new Error('Goal name is required');
  if (!Number.isInteger(input.targetAmountPiastres) || input.targetAmountPiastres <= 0) {
    throw new Error('Target amount must be a positive integer in piastres');
  }

  const initialAmount = input.currentAmountPiastres ?? 0;
  if (!Number.isInteger(initialAmount) || initialAmount < 0) {
    throw new Error('Current amount must be a non-negative integer in piastres');
  }

  const goal: SavingsGoal = {
    name,
    targetAmountPiastres: input.targetAmountPiastres,
    currentAmountPiastres: initialAmount,
    targetDate: input.targetDate || null,
    icon: input.icon || '🎯',
    color: input.color || '#10b981',
    createdAt: new Date(),
  };

  const id = await db.goals.add(goal);
  return id as number;
}

export async function updateSavingsGoal(
  id: number,
  updates: Partial<Omit<SavingsGoal, 'id' | 'createdAt'>>
): Promise<void> {
  const existing = await db.goals.get(id);
  if (!existing) throw new Error(`Goal ${id} not found`);

  if (updates.targetAmountPiastres !== undefined) {
    if (!Number.isInteger(updates.targetAmountPiastres) || updates.targetAmountPiastres <= 0) {
      throw new Error('Target amount must be a positive integer in piastres');
    }
  }

  if (updates.currentAmountPiastres !== undefined) {
    if (!Number.isInteger(updates.currentAmountPiastres) || updates.currentAmountPiastres < 0) {
      throw new Error('Current amount must be a non-negative integer in piastres');
    }
  }

  await db.goals.update(id, updates);
}

export async function contributeToSavingsGoal(
  goalId: number,
  addedPiastres: number
): Promise<void> {
  if (!Number.isInteger(addedPiastres) || addedPiastres <= 0) {
    throw new Error('Contribution amount must be a positive integer in piastres');
  }

  const goal = await db.goals.get(goalId);
  if (!goal) throw new Error(`Goal ${goalId} not found`);

  const updatedCurrent = goal.currentAmountPiastres + addedPiastres;
  await db.goals.update(goalId, {
    currentAmountPiastres: updatedCurrent,
  });
}

export async function deleteSavingsGoal(id: number): Promise<void> {
  await db.goals.delete(id);
}

export async function getSavingsGoalsWithProgress(): Promise<GoalProgress[]> {
  const goals = await db.goals.toArray();
  const now = Date.now();

  return goals.map((g) => {
    const percentage = g.targetAmountPiastres > 0
      ? Math.min(100, Math.round((g.currentAmountPiastres / g.targetAmountPiastres) * 100))
      : 0;

    const remainingPiastres = Math.max(0, g.targetAmountPiastres - g.currentAmountPiastres);
    const isCompleted = g.currentAmountPiastres >= g.targetAmountPiastres;

    let daysRemaining: number | null = null;
    if (g.targetDate) {
      const diffMs = new Date(g.targetDate).getTime() - now;
      daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    return {
      id: g.id!,
      name: g.name,
      targetAmountPiastres: g.targetAmountPiastres,
      currentAmountPiastres: g.currentAmountPiastres,
      remainingPiastres,
      percentage,
      isCompleted,
      targetDate: g.targetDate,
      daysRemaining,
      icon: g.icon,
      color: g.color,
      createdAt: g.createdAt,
    };
  });
}
