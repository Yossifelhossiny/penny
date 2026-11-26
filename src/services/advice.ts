/**
 * Warnings and advice, based on widely used personal-finance guidelines:
 *
 *  - 50/30/20 rule: about 50% of take-home pay on needs, 30% on wants and
 *    at least 20% to savings / paying off debt.
 *  - Emergency fund: 3–6 months of essential expenses set aside.
 *  - Debt load: keep debt payments under ~36% of income.
 *  - Plus Penny-specific checks: spending pace vs budget, budgets vs income,
 *    overdue debts, and how recent your last backup is.
 *
 * These are rules of thumb, not financial advice; every warning says which
 * guideline it comes from.
 */

import { db } from '../db';
import { getAllBalances } from './transactions';
import { getOverallBudgetProgress } from './budgets';
import { getTotalsForMonths, getMonthTransactions } from './periods';
import { getDebtTotals } from './debts';
import { getRecurringIncomes } from './recurring';
import { getLastBackupAt, backupAgeDays } from './storageSafety';
import { addMonths, daysElapsedInMonth, monthsEndingAt, yearMonthOf, type YearMonth } from '../utils/months';
import type { Page } from '../types';

export type Severity = 'high' | 'medium' | 'info';

export interface Advice {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Which guideline this comes from (shown under the warning). */
  basis?: string;
  action?: { label: string; page: Page };
}

/** Categories counted as needs / wants for the 50/30/20 check (by name). */
export const NEEDS = ['Rent', 'Bills', 'Food & Drinks', 'Transportation', 'Healthcare', 'Mobile Recharge'];
export const WANTS = ['Shopping', 'Entertainment', 'Subscriptions', 'Other'];

const egp = (p: number) => `EGP ${Math.round(p / 100).toLocaleString('en-US')}`;
const pct = (n: number) => `${Math.round(n)}%`;

// ---------------------------------------------------------------------------
// Expected income and budget plan
// ---------------------------------------------------------------------------

export interface IncomeEstimate {
  monthlyPiastres: number;
  source: 'recurring' | 'average' | 'this-month' | 'none';
}

/** What you can expect to earn per month: your automatic income, else the recent average. */
export async function estimateMonthlyIncome(now: Date = new Date()): Promise<IncomeEstimate> {
  const recurring = (await getRecurringIncomes()).filter((r) => r.enabled);
  if (recurring.length > 0) {
    return { monthlyPiastres: recurring.reduce((s, r) => s + r.amountPiastres, 0), source: 'recurring' };
  }
  const current = yearMonthOf(now);
  const past = await getTotalsForMonths(monthsEndingAt(addMonths(current, -1), 3));
  const withIncome = past.filter((m) => m.incomePiastres > 0);
  if (withIncome.length > 0) {
    return { monthlyPiastres: Math.round(withIncome.reduce((s, m) => s + m.incomePiastres, 0) / withIncome.length), source: 'average' };
  }
  const [thisMonth] = await getTotalsForMonths([current]);
  if (thisMonth.incomePiastres > 0) return { monthlyPiastres: thisMonth.incomePiastres, source: 'this-month' };
  return { monthlyPiastres: 0, source: 'none' };
}

export interface BudgetPlan {
  incomePiastres: number;
  incomeSource: IncomeEstimate['source'];
  /** What your budgets allow you to spend this month. */
  plannedSpendingPiastres: number;
  /** Sum of the category limits (may differ from an overall limit). */
  categoryLimitsPiastres: number;
  hasOverallLimit: boolean;
  plannedSavingsPiastres: number;
  /** Planned savings as % of income (null when income is unknown). */
  savingsRate: number | null;
  verdict: 'no-budget' | 'no-income' | 'over-income' | 'below-target' | 'on-target';
  /** How much to trim budgets to save 20% (0 if already there). */
  trimToTargetPiastres: number;
}

export const SAVINGS_TARGET = 20;

export async function getBudgetPlan(year: number, month: number, now: Date = new Date()): Promise<BudgetPlan> {
  const [income, overall, budgets] = await Promise.all([estimateMonthlyIncome(now), getOverallBudgetProgress(year, month), db.budgets.toArray()]);
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  // Category limits that apply this month (a month-specific one replaces the default).
  const byCat = new Map<number, number>();
  for (const b of budgets.filter((b) => b.categoryId !== 0 && !b.monthKey)) byCat.set(b.categoryId, b.limitPiastres);
  for (const b of budgets.filter((b) => b.categoryId !== 0 && b.monthKey === key)) byCat.set(b.categoryId, b.limitPiastres);
  const categoryLimits = [...byCat.values()].reduce((s, v) => s + v, 0);

  const planned = overall?.totalLimitPiastres ?? 0;
  const savings = income.monthlyPiastres - planned;
  const rate = income.monthlyPiastres > 0 ? (savings / income.monthlyPiastres) * 100 : null;
  const maxSpend = Math.round(income.monthlyPiastres * (1 - SAVINGS_TARGET / 100));

  let verdict: BudgetPlan['verdict'];
  if (planned === 0) verdict = 'no-budget';
  else if (income.monthlyPiastres === 0) verdict = 'no-income';
  else if (savings < 0) verdict = 'over-income';
  else if ((rate ?? 0) < SAVINGS_TARGET) verdict = 'below-target';
  else verdict = 'on-target';

  return {
    incomePiastres: income.monthlyPiastres,
    incomeSource: income.source,
    plannedSpendingPiastres: planned,
    categoryLimitsPiastres: categoryLimits,
    hasOverallLimit: !!overall?.isCustomOverall,
    plannedSavingsPiastres: savings,
    savingsRate: rate,
    verdict,
    trimToTargetPiastres: income.monthlyPiastres > 0 ? Math.max(0, planned - maxSpend) : 0,
  };
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

async function shareByGroup(ym: YearMonth): Promise<{ needs: number; wants: number }> {
  const [txns, categories] = await Promise.all([getMonthTransactions(ym.year, ym.month), db.categories.toArray()]);
  const name = new Map(categories.map((c) => [c.id, c.name]));
  let needs = 0;
  let wants = 0;
  for (const t of txns) {
    if (t.type !== 'expense') continue;
    const n = name.get(t.categoryId);
    if (n && NEEDS.includes(n)) needs += t.amount;
    else if (n && WANTS.includes(n)) wants += t.amount;
  }
  return { needs, wants };
}

export interface AdviceContext {
  now?: Date;
  /** Result of navigator.storage.persisted() — null when unknown. */
  storagePersisted?: boolean | null;
}

export async function getAdvice(ctx: AdviceContext = {}): Promise<Advice[]> {
  const now = ctx.now ?? new Date();
  const current = yearMonthOf(now);
  const last = addMonths(current, -1);
  const out: Advice[] = [];

  const [[thisMonth], [lastMonth], recent3, balances, accounts, overall, debts, income, plan, lastBackup, txnCount] = await Promise.all([
    getTotalsForMonths([current]),
    getTotalsForMonths([last]),
    getTotalsForMonths(monthsEndingAt(last, 3)),
    getAllBalances(),
    db.accounts.toArray(),
    getOverallBudgetProgress(current.year, current.month),
    getDebtTotals(now),
    estimateMonthlyIncome(now),
    getBudgetPlan(current.year, current.month, now),
    getLastBackupAt(),
    db.transactions.count(),
  ]);

  // 1. Spending more than earning this month.
  if (thisMonth.expensesPiastres > thisMonth.incomePiastres && thisMonth.incomePiastres > 0) {
    out.push({
      id: 'deficit',
      severity: 'high',
      title: 'You’ve spent more than you earned this month',
      detail: `${egp(thisMonth.expensesPiastres)} out vs ${egp(thisMonth.incomePiastres)} in — ${egp(thisMonth.expensesPiastres - thisMonth.incomePiastres)} over.`,
      basis: 'Spending above income eats into savings or adds debt.',
      action: { label: 'See where it went', page: 'reports' },
    });
  }

  // 2. Spending pace vs overall budget.
  const elapsed = daysElapsedInMonth(current.year, current.month, now);
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
  if (overall && overall.totalLimitPiastres > 0 && elapsed >= 5 && thisMonth.expensesPiastres <= overall.totalLimitPiastres) {
    const projected = Math.round((thisMonth.expensesPiastres / elapsed) * daysInMonth);
    if (projected > overall.totalLimitPiastres * 1.05) {
      out.push({
        id: 'pace',
        severity: 'medium',
        title: 'On track to go over your budget',
        detail: `At this pace you’ll spend about ${egp(projected)} this month, above your ${egp(overall.totalLimitPiastres)} limit. Keep daily spending under ${egp(Math.max(0, (overall.totalLimitPiastres - thisMonth.expensesPiastres) / Math.max(1, daysInMonth - elapsed)))} for the rest of the month.`,
        basis: 'Projected from your average daily spending so far.',
        action: { label: 'Open budgets', page: 'budgets' },
      });
    }
  }

  // 3. Savings rate last month (50/30/20).
  if (lastMonth.incomePiastres > 0) {
    const rate = ((lastMonth.incomePiastres - lastMonth.expensesPiastres) / lastMonth.incomePiastres) * 100;
    if (rate < SAVINGS_TARGET) {
      out.push({
        id: 'savings-rate',
        severity: rate < 0 ? 'high' : 'medium',
        title: rate < 0 ? `You overspent in ${lastMonth.label}` : `You saved ${pct(rate)} of your income in ${lastMonth.label}`,
        detail:
          rate < 0
            ? `Spending was ${egp(lastMonth.expensesPiastres - lastMonth.incomePiastres)} more than income.`
            : `To reach 20% you’d have needed to keep about ${egp(lastMonth.incomePiastres * 0.2 - (lastMonth.incomePiastres - lastMonth.expensesPiastres))} more.`,
        basis: '50/30/20 rule: aim to save at least 20% of take-home pay.',
        action: { label: 'Review reports', page: 'reports' },
      });
    }

    // 4. Needs / wants split.
    const split = await shareByGroup(last);
    const needsPct = (split.needs / lastMonth.incomePiastres) * 100;
    const wantsPct = (split.wants / lastMonth.incomePiastres) * 100;
    if (needsPct > 50) {
      out.push({
        id: 'needs',
        severity: 'info',
        title: `Essentials took ${pct(needsPct)} of your income`,
        detail: 'Rent, bills, food, transport and health together were above half of what you earned.',
        basis: '50/30/20 rule: keep needs around 50% of income.',
      });
    }
    if (wantsPct > 30) {
      out.push({
        id: 'wants',
        severity: 'medium',
        title: `Extras took ${pct(wantsPct)} of your income`,
        detail: 'Shopping, entertainment and subscriptions were above the 30% guideline — the easiest place to cut.',
        basis: '50/30/20 rule: keep wants around 30% of income.',
        action: { label: 'Set limits', page: 'budgets' },
      });
    }
  }

  // 5. Emergency fund.
  const monthsWithSpend = recent3.filter((m) => m.expensesPiastres > 0);
  if (monthsWithSpend.length > 0) {
    const avgSpend = monthsWithSpend.reduce((s, m) => s + m.expensesPiastres, 0) / monthsWithSpend.length;
    const total = accounts.reduce((s, a) => s + (balances.get(a.id!) ?? a.openingBalance), 0);
    const months = avgSpend > 0 ? total / avgSpend : Infinity;
    if (months < 3) {
      out.push({
        id: 'emergency',
        severity: months < 1 ? 'high' : 'medium',
        title: months < 1 ? 'Less than one month of expenses saved' : `About ${months.toFixed(1)} months of expenses saved`,
        detail: `Your balance covers ${months < 0 ? 'none' : `${months.toFixed(1)} months`} of your usual ${egp(avgSpend)} monthly spending. A 3-month cushion would be ${egp(avgSpend * 3)}.`,
        basis: 'Common guidance: keep 3–6 months of essential expenses as an emergency fund.',
        action: { label: 'Create a savings goal', page: 'budgets' },
      });
    }
  }

  // 6. Budgets vs income.
  if (plan.verdict === 'over-income') {
    out.push({
      id: 'plan-over',
      severity: 'high',
      title: 'Your budgets add up to more than your income',
      detail: `Budgets allow ${egp(plan.plannedSpendingPiastres)} against about ${egp(plan.incomePiastres)} income. Trim ${egp(plan.trimToTargetPiastres)} to save 20%.`,
      basis: '50/30/20 rule: plan to keep at least 20% of income.',
      action: { label: 'Adjust budgets', page: 'budgets' },
    });
  } else if (plan.verdict === 'below-target') {
    out.push({
      id: 'plan-low',
      severity: 'info',
      title: `Your budgets leave ${pct(plan.savingsRate ?? 0)} for savings`,
      detail: `Lowering limits by ${egp(plan.trimToTargetPiastres)} would let you save 20%.`,
      basis: '50/30/20 rule.',
      action: { label: 'Adjust budgets', page: 'budgets' },
    });
  }

  // 7. Debts.
  for (const d of debts.overdue.slice(0, 3)) {
    const person = await db.people.get(d.personId);
    const name = person?.name ?? 'someone';
    out.push({
      id: `debt-${d.id}`,
      severity: d.direction === 'borrowed' ? 'high' : 'medium',
      title: d.direction === 'borrowed' ? `Payment to ${name} is overdue` : `${name} was due to pay you back`,
      detail: `Due ${d.dueDate!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${d.reason ? ` · ${d.reason}` : ''}.`,
      action: { label: 'Open debts', page: 'people' },
    });
  }
  if (income.monthlyPiastres > 0 && debts.youOwePiastres > income.monthlyPiastres * 0.36) {
    out.push({
      id: 'debt-load',
      severity: 'medium',
      title: `You owe ${pct((debts.youOwePiastres / income.monthlyPiastres) * 100)} of a month’s income`,
      detail: `${egp(debts.youOwePiastres)} borrowed and not yet repaid. Paying it down before new spending keeps it manageable.`,
      basis: 'Guideline: keep debt payments under about 36% of income.',
      action: { label: 'Open debts', page: 'people' },
    });
  }

  // 8. Data safety.
  if (txnCount > 0) {
    const age = backupAgeDays(lastBackup, now);
    if (age === null || age > 14) {
      out.push({
        id: 'backup',
        severity: age === null ? 'medium' : 'info',
        title: age === null ? 'You haven’t backed up yet' : `Last backup was ${age} days ago`,
        detail: 'Your data lives only on this phone. Save a backup to iCloud Drive so nothing is lost if Penny is removed or the phone is replaced.',
        action: { label: 'Back up now', page: 'settings' },
      });
    }
    if (ctx.storagePersisted === false) {
      out.push({
        id: 'persist',
        severity: 'info',
        title: 'Storage isn’t protected yet',
        detail: 'Open Penny from the Home Screen icon so iPhone keeps its data even when space runs low.',
      });
    }
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
