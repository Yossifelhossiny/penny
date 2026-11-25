import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatEGP } from '../utils/format';
import { getAllBalances, getMonthlyTotals, getRecentTransactions } from '../services/transactions';
import {
  getCategorySpendingBreakdown,
  getMonthlyTrend,
  getFinancialHealthInsights,
  type CategorySpendingItem,
  type MonthSummaryItem,
  type FinancialHealthInsights,
} from '../services/insights';
import {
  getOverallBudgetProgress,
  getActiveSpendingAlerts,
  type OverallBudgetProgress,
  type SpendingAlert,
} from '../services/budgets';
import { SpendingAlertBanner } from '../components/budgets/SpendingAlertBanner';
import { CategoryBreakdownChart } from '../components/dashboard/CategoryBreakdownChart';
import { MonthlyComparisonChart } from '../components/dashboard/MonthlyComparisonChart';
import { FinancialHealthCard } from '../components/dashboard/FinancialHealthCard';
import { TransactionList } from '../components/transactions/TransactionList';
import { AddTransactionForm } from '../components/transactions/AddTransactionForm';
import { TransferForm } from '../components/transactions/TransferForm';
import type { Transaction, Page } from '../types';

interface Props {
  onNavigate: (page: Page) => void;
}

type InsightTab = 'categories' | 'trends' | 'health';

export function Dashboard({ onNavigate }: Props) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState<InsightTab>('categories');

  // Modals
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  // Financial data state
  const [balances, setBalances] = useState<Map<number, number>>(new Map());
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [categorySpending, setCategorySpending] = useState<CategorySpendingItem[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthSummaryItem[]>([]);
  const [healthInsights, setHealthInsights] = useState<FinancialHealthInsights | null>(null);
  const [overallBudget, setOverallBudget] = useState<OverallBudgetProgress | null>(null);
  const [spendingAlerts, setSpendingAlerts] = useState<SpendingAlert[]>([]);

  const accounts = useLiveQuery(() => db.accounts.toArray());
  const allTransactions = useLiveQuery(() => db.transactions.toArray());
  const allBudgets = useLiveQuery(() => db.budgets.toArray());

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const monthName = selectedDate.toLocaleString('en', { month: 'long' });
  const isCurrentMonth =
    new Date().getFullYear() === year && new Date().getMonth() === month;

  // Recompute balances, insights, and summaries
  useEffect(() => {
    if (allTransactions === undefined) return;

    // When the month changes quickly, older requests can finish after newer
    // ones; ignore their results so the screen always shows the chosen month.
    let cancelled = false;
    const keep = <T,>(set: (v: T) => void) => (v: T) => {
      if (!cancelled) set(v);
    };

    getAllBalances().then(keep(setBalances));

    getMonthlyTotals(year, month).then(keep(({ income, expenses }) => {
      setMonthlyIncome(income);
      setMonthlyExpenses(expenses);
    }));

    getRecentTransactions(5).then(keep(setRecentTxns));
    getCategorySpendingBreakdown(year, month).then(keep(setCategorySpending));
    getMonthlyTrend(6, year, month).then(keep(setMonthlyTrend));
    getFinancialHealthInsights(year, month).then(keep(setHealthInsights));
    getOverallBudgetProgress(year, month).then(keep(setOverallBudget));
    getActiveSpendingAlerts(year, month).then(keep(setSpendingAlerts));

    return () => {
      cancelled = true;
    };
  }, [allTransactions, allBudgets, year, month]);

  function handlePrevMonth() {
    setSelectedDate(new Date(year, month - 1, 1));
  }

  function handleNextMonth() {
    setSelectedDate(new Date(year, month + 1, 1));
  }

  function handleCurrentMonth() {
    setSelectedDate(new Date());
  }

  const totalBalance =
    accounts?.reduce((sum, a) => {
      return sum + (balances.get(a.id!) ?? a.openingBalance);
    }, 0) ?? 0;

  const netSavings = monthlyIncome - monthlyExpenses;

  return (
    <div className="p-4 space-y-6">
      {/* Month Navigation & Period Selector */}
      <div className="flex items-center justify-between bg-surface rounded-xl px-3 py-2 border border-white/5">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="text-text-muted hover:text-text px-2 py-1 rounded hover:bg-surface-light text-sm font-bold transition-colors cursor-pointer"
          title="Previous Month"
        >
          ‹
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">
            {monthName} {year}
          </span>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={handleCurrentMonth}
              className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium hover:bg-primary/25 cursor-pointer"
            >
              Current
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="text-text-muted hover:text-text px-2 py-1 rounded hover:bg-surface-light text-sm font-bold transition-colors cursor-pointer"
          title="Next Month"
        >
          ›
        </button>
      </div>

      {/* Spending Alerts Banner */}
      <SpendingAlertBanner
        alerts={spendingAlerts}
        onManageBudgets={() => onNavigate('budgets')}
      />

      {/* Total Balance Card */}
      <div className="bg-surface rounded-2xl p-6 text-center border border-white/5 space-y-1">
        <p className="text-xs text-text-muted">Total Available Net Worth</p>
        <p className="text-3xl font-bold text-primary">{formatEGP(totalBalance)}</p>
        <div className="pt-1 flex items-center justify-center gap-1.5 text-xs text-text-muted">
          <span>Net in {monthName}:</span>
          <span
            className={`font-semibold ${
              netSavings >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {netSavings >= 0 ? '+' : ''}{formatEGP(netSavings)}
          </span>
        </div>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-4 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted">{monthName} Income</span>
            <span className="text-sm">💰</span>
          </div>
          <p className="text-lg font-bold text-success">{formatEGP(monthlyIncome)}</p>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted">{monthName} Expenses</span>
            <span className="text-sm">💸</span>
          </div>
          <p className="text-lg font-bold text-danger">{formatEGP(monthlyExpenses)}</p>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onNavigate('import')}
          className="bg-surface hover:bg-surface-light border border-white/5 rounded-xl p-2.5 flex flex-col items-center gap-1 text-xs font-medium text-text transition-colors cursor-pointer"
        >
          <span className="text-lg">📥</span>
          <span>Import SMS</span>
        </button>
        <button
          type="button"
          onClick={() => setShowAddTxn(true)}
          className="bg-surface hover:bg-surface-light border border-white/5 rounded-xl p-2.5 flex flex-col items-center gap-1 text-xs font-medium text-text transition-colors cursor-pointer"
        >
          <span className="text-lg">➕</span>
          <span>Add Transaction</span>
        </button>
        <button
          type="button"
          onClick={() => setShowTransfer(true)}
          className="bg-surface hover:bg-surface-light border border-white/5 rounded-xl p-2.5 flex flex-col items-center gap-1 text-xs font-medium text-text transition-colors cursor-pointer"
        >
          <span className="text-lg">🔄</span>
          <span>Transfer</span>
        </button>
      </div>

      {/* Monthly Budget Ceiling Card */}
      {overallBudget && (
        <div
          onClick={() => onNavigate('budgets')}
          className="bg-surface hover:bg-surface-light/60 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors cursor-pointer space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <div>
                <p className="font-semibold text-xs text-text">Monthly Budget Target</p>
                <p className="text-[11px] text-text-muted">
                  {overallBudget.remainingPiastres >= 0
                    ? `${formatEGP(overallBudget.remainingPiastres)} remaining`
                    : `Exceeded by ${formatEGP(Math.abs(overallBudget.remainingPiastres))}`}
                </p>
              </div>
            </div>

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

          <div className="flex items-center justify-between text-[11px] text-text-muted pt-0.5">
            <span>
              Spent {formatEGP(overallBudget.totalSpentPiastres)} of {formatEGP(overallBudget.totalLimitPiastres)}
            </span>
            <span className="text-primary font-medium">Manage Budgets & Goals →</span>
          </div>
        </div>
      )}

      {/* Insights Section with Tab Switcher */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Insights & Analytics
          </h2>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-surface rounded-xl p-1 border border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              activeTab === 'categories'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Categories
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trends')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              activeTab === 'trends'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Income vs Expense
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('health')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              activeTab === 'health'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Health
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'categories' && (
          <CategoryBreakdownChart
            items={categorySpending}
            totalExpensesPiastres={monthlyExpenses}
          />
        )}

        {activeTab === 'trends' && (
          <MonthlyComparisonChart data={monthlyTrend} />
        )}

        {activeTab === 'health' && healthInsights && (
          <FinancialHealthCard
            insights={healthInsights}
            monthName={monthName}
          />
        )}
      </div>

      {/* Account Snapshot Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Accounts
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('accounts')}
            className="text-xs text-primary font-medium hover:underline cursor-pointer"
          >
            View All ({accounts?.length ?? 0})
          </button>
        </div>
        {accounts?.map((account) => (
          <div
            key={account.id}
            onClick={() => onNavigate('accounts')}
            className="bg-surface hover:bg-surface-light/60 rounded-xl p-4 flex items-center justify-between cursor-pointer transition-colors border border-white/5"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{account.icon}</span>
              <div>
                <p className="font-medium text-sm">{account.name}</p>
                <p className="text-xs text-text-muted capitalize">
                  {account.type.replace('_', ' ')}
                </p>
              </div>
            </div>
            <p
              className={`font-semibold text-sm ${
                (balances.get(account.id!) ?? account.openingBalance) < 0 ? 'text-danger' : 'text-text'
              }`}
            >
              {formatEGP(balances.get(account.id!) ?? account.openingBalance)}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Transactions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Recent Transactions
          </h2>
          {recentTxns.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="text-xs text-primary font-medium hover:underline cursor-pointer"
            >
              See All
            </button>
          )}
        </div>
        <TransactionList
          transactions={recentTxns}
          onEdit={() => onNavigate('transactions')}
          onDelete={() => onNavigate('transactions')}
          compact
        />
      </div>

      {/* Add Transaction Modal */}
      {showAddTxn && (
        <AddTransactionForm
          onClose={() => setShowAddTxn(false)}
          onSaved={() => setShowAddTxn(false)}
        />
      )}

      {/* Transfer Modal */}
      {showTransfer && (
        <TransferForm
          onClose={() => setShowTransfer(false)}
          onSaved={() => setShowTransfer(false)}
        />
      )}
    </div>
  );
}
