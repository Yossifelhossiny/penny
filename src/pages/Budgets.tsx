import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Page } from '../types';
import {
  getBudgetsWithProgress,
  getOverallBudgetProgress,
  getActiveSpendingAlerts,
  getSavingsGoalsWithProgress,
  type BudgetProgress,
  type OverallBudgetProgress,
  type SpendingAlert,
  type GoalProgress,
} from '../services/budgets';
import { formatEGP } from '../utils/format';
import { SpendingAlertBanner } from '../components/budgets/SpendingAlertBanner';
import { BudgetModal } from '../components/budgets/BudgetModal';
import { SavingsGoalModal } from '../components/budgets/SavingsGoalModal';
import { ContributeGoalModal } from '../components/budgets/ContributeGoalModal';

interface Props {
  onNavigate?: (page: Page) => void;
}

type TabType = 'budgets' | 'goals';

export function Budgets({ onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('budgets');
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Data state
  const [budgetList, setBudgetList] = useState<BudgetProgress[]>([]);
  const [overallBudget, setOverallBudget] = useState<OverallBudgetProgress | null>(null);
  const [spendingAlerts, setSpendingAlerts] = useState<SpendingAlert[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<GoalProgress[]>([]);

  // Modals state
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<{
    id?: number;
    categoryId: number;
    limitPiastres: number;
    monthKey?: string | null;
  } | null>(null);

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalProgress | null>(null);

  const [contributeGoal, setContributeGoal] = useState<GoalProgress | null>(null);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const monthName = selectedDate.toLocaleString('en', { month: 'long' });

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const allTransactions = useLiveQuery(() => db.transactions.toArray());
  const allBudgets = useLiveQuery(() => db.budgets.toArray());
  const allGoals = useLiveQuery(() => db.goals.toArray());

  // Reload budget progress whenever transactions or budgets change
  useEffect(() => {
    if (allTransactions === undefined || allBudgets === undefined) return;

    getBudgetsWithProgress(year, month).then(setBudgetList);
    getOverallBudgetProgress(year, month).then(setOverallBudget);
    getActiveSpendingAlerts(year, month).then(setSpendingAlerts);
  }, [allTransactions, allBudgets, year, month]);

  // Reload savings goals whenever goals table changes
  useEffect(() => {
    if (allGoals === undefined) return;
    getSavingsGoalsWithProgress().then(setSavingsGoals);
  }, [allGoals]);

  function handlePrevMonth() {
    setSelectedDate(new Date(year, month - 1, 1));
  }

  function handleNextMonth() {
    setSelectedDate(new Date(year, month + 1, 1));
  }

  function handleOpenAddBudget(categoryId = 0) {
    setEditingBudget({
      categoryId,
      limitPiastres: 0,
    });
    setShowBudgetModal(true);
  }

  function handleOpenEditBudget(b: BudgetProgress) {
    setEditingBudget({
      id: b.id,
      categoryId: b.categoryId,
      limitPiastres: b.limitPiastres,
      monthKey: b.monthKey,
    });
    setShowBudgetModal(true);
  }

  const totalSavedAcrossGoals = savingsGoals.reduce(
    (sum, g) => sum + g.currentAmountPiastres,
    0
  );
  const totalTargetAcrossGoals = savingsGoals.reduce(
    (sum, g) => sum + g.targetAmountPiastres,
    0
  );

  return (
    <div className="p-4 space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>🎯</span>
            <span>Budgets & Goals</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Spending caps, warnings, and savings milestones
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('dashboard')}
            className="text-xs text-text-muted hover:text-text px-2 py-1 rounded bg-surface transition-colors cursor-pointer"
          >
            ← Home
          </button>
        )}
      </div>

      {/* Main Tab Switcher */}
      <div className="flex bg-surface rounded-xl p-1 border border-white/5">
        <button
          type="button"
          onClick={() => setActiveTab('budgets')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'budgets'
              ? 'bg-primary text-white shadow-xs'
              : 'text-text-muted hover:text-text'
          }`}
        >
          Monthly Budgets ({budgetList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('goals')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'goals'
              ? 'bg-primary text-white shadow-xs'
              : 'text-text-muted hover:text-text'
          }`}
        >
          Savings Goals ({savingsGoals.length})
        </button>
      </div>

      {/* ======================================================== */}
      {/* 1. Monthly Budgets Tab                                   */}
      {/* ======================================================== */}
      {activeTab === 'budgets' && (
        <div className="space-y-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between bg-surface rounded-xl px-3 py-2 border border-white/5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="text-text-muted hover:text-text px-2 py-1 rounded text-sm font-bold transition-colors cursor-pointer"
            >
              ‹
            </button>
            <span className="text-xs font-semibold text-text">
              {monthName} {year} Budgets
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="text-text-muted hover:text-text px-2 py-1 rounded text-sm font-bold transition-colors cursor-pointer"
            >
              ›
            </button>
          </div>

          {/* Active Spending Alerts Banner */}
          <SpendingAlertBanner alerts={spendingAlerts} />

          {/* Overall Monthly Budget Ceiling Card */}
          <div className="bg-surface rounded-2xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Monthly Spending Ceiling
                </h3>
                <p className="text-xs text-text mt-0.5">
                  {overallBudget
                    ? overallBudget.isCustomOverall
                      ? 'Custom Overall Monthly Limit'
                      : 'Combined Category Limits'
                    : 'No overall monthly budget set'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleOpenAddBudget(0)}
                className="text-xs bg-primary/15 text-primary hover:bg-primary/25 font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                {overallBudget?.isCustomOverall ? 'Edit Ceiling' : '+ Set Ceiling'}
              </button>
            </div>

            {overallBudget && (
              <div className="space-y-2 pt-1 border-t border-white/5">
                <div className="flex items-baseline justify-between">
                  <p className="text-xl font-bold text-text">
                    {formatEGP(overallBudget.totalSpentPiastres)}
                    <span className="text-xs text-text-muted font-normal">
                      {' '}
                      / {formatEGP(overallBudget.totalLimitPiastres)}
                    </span>
                  </p>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      overallBudget.status === 'exceeded'
                        ? 'bg-danger/20 text-danger'
                        : overallBudget.status === 'warning'
                        ? 'bg-warning/20 text-warning'
                        : 'bg-success/20 text-success'
                    }`}
                  >
                    {overallBudget.percentage}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-surface-light rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      overallBudget.status === 'exceeded'
                        ? 'bg-danger'
                        : overallBudget.status === 'warning'
                        ? 'bg-warning'
                        : 'bg-primary'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(3, overallBudget.percentage))}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-text-muted pt-0.5">
                  <span>
                    {overallBudget.remainingPiastres >= 0
                      ? `${formatEGP(overallBudget.remainingPiastres)} remaining`
                      : `Exceeded by ${formatEGP(Math.abs(overallBudget.remainingPiastres))}`}
                  </span>
                  <span>{monthName} Ceiling</span>
                </div>
              </div>
            )}
          </div>

          {/* Category Budgets Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Category Budgets ({budgetList.length})
              </h3>
              <button
                type="button"
                onClick={() => handleOpenAddBudget(1)}
                className="text-xs bg-primary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors cursor-pointer"
              >
                + Set Budget
              </button>
            </div>

            {budgetList.length === 0 ? (
              <div className="bg-surface rounded-xl p-8 text-center border border-white/5 space-y-2">
                <p className="text-3xl">🎯</p>
                <p className="text-sm font-semibold">No category budgets yet</p>
                <p className="text-xs text-text-muted">
                  Set spending caps on Food, Shopping, or Bills to receive warnings before you overspend.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAddBudget(1)}
                  className="mt-2 text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-medium inline-block cursor-pointer"
                >
                  + Set First Budget
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {budgetList.map((item) => (
                  <div
                    key={item.id}
                    className="bg-surface rounded-xl p-3.5 border border-white/5 space-y-2.5 hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-2xl shrink-0">{item.categoryIcon}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-text truncate">
                            {item.categoryName}
                          </p>
                          <p className="text-[11px] text-text-muted">
                            Limit: {formatEGP(item.limitPiastres)}
                            {item.monthKey ? ' (This Month)' : ' (Monthly)'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.status === 'exceeded'
                              ? 'bg-danger/20 text-danger'
                              : item.status === 'warning'
                              ? 'bg-warning/20 text-warning'
                              : 'bg-surface-light text-text-muted'
                          }`}
                        >
                          {item.percentage}%
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditBudget(item)}
                          className="text-xs text-text-muted hover:text-text p-1 cursor-pointer"
                          title="Edit Budget"
                        >
                          ✏️
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-surface-light rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.status === 'exceeded'
                            ? 'bg-danger'
                            : item.status === 'warning'
                            ? 'bg-warning'
                            : 'bg-primary'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(3, item.percentage))}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-text-muted pt-0.5">
                      <span>Spent: {formatEGP(item.spentPiastres)}</span>
                      <span
                        className={
                          item.remainingPiastres >= 0
                            ? 'text-text-muted'
                            : 'text-danger font-medium'
                        }
                      >
                        {item.remainingPiastres >= 0
                          ? `${formatEGP(item.remainingPiastres)} remaining`
                          : `Over by ${formatEGP(Math.abs(item.remainingPiastres))}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. Savings Goals Tab                                     */}
      {/* ======================================================== */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          {/* Goals Header Card */}
          <div className="bg-surface rounded-2xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Total Savings in Goals
                </h3>
                <p className="text-2xl font-bold text-primary mt-1">
                  {formatEGP(totalSavedAcrossGoals)}
                </p>
                <p className="text-[11px] text-text-muted">
                  Across {savingsGoals.length} goal{savingsGoals.length === 1 ? '' : 's'}{' '}
                  (Target: {formatEGP(totalTargetAcrossGoals)})
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingGoal(null);
                  setShowGoalModal(true);
                }}
                className="text-xs bg-primary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors cursor-pointer"
              >
                + New Goal
              </button>
            </div>
          </div>

          {/* Goals List */}
          {savingsGoals.length === 0 ? (
            <div className="bg-surface rounded-xl p-8 text-center border border-white/5 space-y-2">
              <p className="text-3xl">🏖️</p>
              <p className="text-sm font-semibold">No savings goals yet</p>
              <p className="text-xs text-text-muted">
                Create a goal for an Emergency Fund, a summer trip, or a new laptop to track your progress.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingGoal(null);
                  setShowGoalModal(true);
                }}
                className="mt-2 text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-medium inline-block cursor-pointer"
              >
                + Create First Goal
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {savingsGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="bg-surface rounded-2xl p-4 border border-white/5 space-y-3 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl shrink-0">{goal.icon}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm text-text">{goal.name}</p>
                          {goal.isCompleted && (
                            <span className="text-[10px] bg-success/20 text-success font-bold px-2 py-0.5 rounded-full">
                              Completed!
                            </span>
                          )}
                        </div>
                        {goal.daysRemaining !== null && goal.daysRemaining !== undefined && (
                          <p className="text-[11px] text-text-muted">
                            {goal.daysRemaining > 0
                              ? `${goal.daysRemaining} days remaining`
                              : goal.daysRemaining === 0
                              ? 'Target is today!'
                              : `Target date was ${Math.abs(goal.daysRemaining)} days ago`}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingGoal(goal);
                        setShowGoalModal(true);
                      }}
                      className="text-xs text-text-muted hover:text-text p-1 cursor-pointer"
                      title="Edit Goal"
                    >
                      ⚙️
                    </button>
                  </div>

                  {/* Amounts & Percentage */}
                  <div className="flex items-baseline justify-between pt-1">
                    <p className="text-base font-bold text-text">
                      {formatEGP(goal.currentAmountPiastres)}
                      <span className="text-xs font-normal text-text-muted">
                        {' '}
                        / {formatEGP(goal.targetAmountPiastres)}
                      </span>
                    </p>
                    <span
                      className="text-xs font-bold"
                      style={{ color: goal.color }}
                    >
                      {goal.percentage}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 w-full bg-surface-light rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(2, goal.percentage))}%`,
                        backgroundColor: goal.color,
                      }}
                    />
                  </div>

                  {/* Action row */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs">
                    <span className="text-text-muted text-[11px]">
                      {goal.remainingPiastres > 0
                        ? `${formatEGP(goal.remainingPiastres)} left to save`
                        : '🎉 Target reached!'}
                    </span>

                    <button
                      type="button"
                      onClick={() => setContributeGoal(goal)}
                      className="text-xs bg-primary/15 text-primary hover:bg-primary/25 font-semibold px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                    >
                      + Add Funds
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Budget Modal */}
      {showBudgetModal && editingBudget && (
        <BudgetModal
          initialCategoryId={editingBudget.categoryId}
          initialLimitPiastres={editingBudget.limitPiastres}
          existingBudgetId={editingBudget.id}
          monthKey={editingBudget.monthKey}
          categories={categories}
          year={year}
          month={month}
          onClose={() => {
            setShowBudgetModal(false);
            setEditingBudget(null);
          }}
          onSaved={() => {
            getBudgetsWithProgress(year, month).then(setBudgetList);
            getOverallBudgetProgress(year, month).then(setOverallBudget);
            getActiveSpendingAlerts(year, month).then(setSpendingAlerts);
          }}
        />
      )}

      {/* Savings Goal Modal */}
      {showGoalModal && (
        <SavingsGoalModal
          goal={editingGoal || undefined}
          onClose={() => {
            setShowGoalModal(false);
            setEditingGoal(null);
          }}
          onSaved={() => {
            getSavingsGoalsWithProgress().then(setSavingsGoals);
          }}
          onDeleted={() => {
            getSavingsGoalsWithProgress().then(setSavingsGoals);
          }}
        />
      )}

      {/* Contribute Funds Modal */}
      {contributeGoal && (
        <ContributeGoalModal
          goal={contributeGoal}
          onClose={() => setContributeGoal(null)}
          onContributed={() => {
            getSavingsGoalsWithProgress().then(setSavingsGoals);
          }}
        />
      )}
    </div>
  );
}
