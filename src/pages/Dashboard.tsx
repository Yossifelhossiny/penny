import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, CircleHelp, Inbox, MessageSquareText, Settings as SettingsIcon, Target } from 'lucide-react';
import { db } from '../db';
import { deleteTransaction, getAllBalances, getMonthlyTotals, getRecentTransactions } from '../services/transactions';
import { getCategorySpendingBreakdown, type CategorySpendingItem } from '../services/insights';
import { getOverallBudgetProgress, getActiveSpendingAlerts, type OverallBudgetProgress, type SpendingAlert } from '../services/budgets';
import { getRecentMonthlyTotals, type MonthTotals } from '../services/periods';
import { findMisdatedTransactions, type DateSuggestion } from '../services/dateAudit';
import { countUncategorizedTransactions } from '../services/sms/smsInboxService';
import { useMonthSelection } from '../hooks/useMonthSelection';
import { monthLabel } from '../utils/months';
import { formatEGP, formatWhole } from '../utils/format';
import { TransactionList } from '../components/transactions/TransactionList';
import { AddTransactionForm, type EntryMode } from '../components/transactions/AddTransactionForm';
import { TrendChart } from '../components/dashboard/TrendChart';
import { CategoryBreakdown } from '../components/dashboard/CategoryBreakdown';
import { DateFixSheet } from '../components/settings/DateFixSheet';
import { PennyMark } from '../components/layout/PennyMark';
import { AccountIcon, Amount, Button, Card, IconButton, MonthSwitcher, ProgressBar, Section, Skeleton, cx } from '../components/ui';
import type { Transaction, Page } from '../types';

interface Props {
  onNavigate: (page: Page) => void;
  onAdd: (mode: EntryMode) => void;
  onOpenUncategorized: () => void;
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = { bank: 'Bank', vodafone_cash: 'Mobile wallet', cash: 'Cash' };

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Dashboard({ onNavigate, onAdd, onOpenUncategorized }: Props) {
  const sel = useMonthSelection();
  const { year, month } = sel;

  const [balances, setBalances] = useState<Map<number, number> | null>(null);
  const [totals, setTotals] = useState<{ income: number; expenses: number } | null>(null);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategorySpendingItem[]>([]);
  const [trend, setTrend] = useState<MonthTotals[]>([]);
  const [budget, setBudget] = useState<OverallBudgetProgress | null>(null);
  const [alerts, setAlerts] = useState<SpendingAlert[]>([]);
  const [uncategorized, setUncategorized] = useState(0);
  const [misdated, setMisdated] = useState<DateSuggestion[]>([]);
  const [showDateFix, setShowDateFix] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accounts = useLiveQuery(() => db.accounts.toArray());
  // Any add/edit/delete (including SMS saved by the service worker) re-runs the summaries.
  const allTxns = useLiveQuery(() => db.transactions.toArray());
  const allBudgets = useLiveQuery(() => db.budgets.toArray());
  const pendingSms = useLiveQuery(() => db.smsInbox.where('status').equals('pending').count(), [], 0);

  useEffect(() => {
    if (allTxns === undefined) return;
    // Ignore results from an older month if the user switches quickly.
    let cancelled = false;
    const keep = <T,>(set: (v: T) => void) => (v: T) => {
      if (!cancelled) set(v);
    };
    getAllBalances().then(keep(setBalances));
    getMonthlyTotals(year, month).then(keep(setTotals));
    getRecentTransactions(5).then(keep(setRecentTxns));
    getCategorySpendingBreakdown(year, month).then(keep(setCategories));
    getRecentMonthlyTotals({ year, month }, 6).then(keep(setTrend));
    getOverallBudgetProgress(year, month).then(keep(setBudget));
    getActiveSpendingAlerts(year, month).then(keep(setAlerts));
    countUncategorizedTransactions().then(keep(setUncategorized));
    findMisdatedTransactions().then(keep(setMisdated));
    return () => {
      cancelled = true;
    };
  }, [allTxns, allBudgets, year, month]);

  const totalBalance = accounts?.reduce((sum, a) => sum + (balances?.get(a.id!) ?? a.openingBalance), 0) ?? 0;
  const income = totals?.income ?? 0;
  const expenses = totals?.expenses ?? 0;
  const left = income - expenses;
  const monthName = monthLabel(year, month);
  const loading = balances === null || totals === null;

  const todo: Array<{ key: string; icon: React.ReactNode; title: string; detail: string; onClick: () => void; tone: 'brand' | 'warning' }> = [];
  if (pendingSms > 0)
    todo.push({ key: 'sms', icon: <Inbox />, title: `${pendingSms} SMS to review`, detail: 'Penny wasn’t sure about these', onClick: () => onNavigate('import'), tone: 'brand' });
  if (uncategorized > 0)
    todo.push({ key: 'cat', icon: <CircleHelp />, title: `${uncategorized} without a category`, detail: 'Saved automatically from SMS', onClick: onOpenUncategorized, tone: 'warning' });
  if (misdated.length > 0)
    todo.push({ key: 'date', icon: <CalendarClock />, title: `${misdated.length} in the wrong month`, detail: 'Misread SMS dates — review the fix', onClick: () => setShowDateFix(true), tone: 'warning' });
  for (const a of alerts.slice(0, 2))
    todo.push({ key: `b${a.categoryId}`, icon: <Target />, title: a.title, detail: `${a.percentage}% of budget used`, onClick: () => onNavigate('budgets'), tone: a.type === 'exceeded' ? 'warning' : 'brand' });

  return (
    <div className="space-y-7">
      {/* Top bar */}
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <PennyMark className="size-9" />
          <div>
            <p className="text-[12px] font-semibold text-ink-3 leading-4">{greeting(sel.today)}</p>
            <p className="text-[17px] font-bold tracking-[-0.01em] leading-5">Penny</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Import SMS" onClick={() => onNavigate('import')} className="relative">
            <MessageSquareText className="size-5" />
            {pendingSms > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-brand-500 ring-2 ring-canvas" />}
          </IconButton>
          <IconButton label="Settings" onClick={() => onNavigate('settings')}>
            <SettingsIcon className="size-5" />
          </IconButton>
        </div>
      </header>

      {/* Balance hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-grad-hero text-white p-6 shadow-raised">
        <p className="text-[13px] font-semibold text-white/75">Total balance</p>
        {loading ? (
          <Skeleton className="h-10 w-48 mt-2 opacity-30" />
        ) : (
          <Amount piastres={totalBalance} tone="inverse" size="display" className="mt-2" />
        )}
        <p className="text-[13px] text-white/70 mt-2">
          Across {accounts?.length ?? 0} {accounts?.length === 1 ? 'account' : 'accounts'}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-white/[0.12] p-1.5 backdrop-blur-sm">
          {[
            { label: 'Income', value: income, icon: <ArrowDownLeft className="size-3.5" /> },
            { label: 'Spent', value: expenses, icon: <ArrowUpRight className="size-3.5" /> },
            { label: 'Left', value: left, icon: null },
          ].map((s) => (
            <div key={s.label} className={cx('rounded-xl px-2.5 py-2.5', s.label === 'Left' && 'bg-white/[0.14]')}>
              <p className="flex items-center gap-1 text-[11px] font-semibold text-white/75">
                {s.icon}
                {s.label}
              </p>
              <p className="num text-[15px] font-bold mt-0.5 truncate">{s.value < 0 ? '−' : ''}{formatWhole(Math.abs(s.value))}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Month */}
      <div className="flex items-center justify-between -mt-2">
        <MonthSwitcher sel={sel} />
        {!sel.isCurrent && <span className="text-[12px] text-ink-3">Figures for {monthName}</span>}
      </div>

      {/* To do */}
      {todo.length > 0 && (
        <Section title="Needs your attention">
          <Card padded={false} className="py-1.5">
            {todo.map((t) => (
              <button key={t.key} type="button" onClick={t.onClick} className="w-full flex items-center gap-3.5 px-4 py-3 text-left hover:bg-brand-50/60 transition-colors">
                <span
                  className={cx(
                    'size-10 rounded-[13px] flex items-center justify-center shrink-0 [&_svg]:size-5',
                    t.tone === 'warning' ? 'bg-caution-soft text-caution' : 'bg-brand-50 text-brand-600'
                  )}
                >
                  {t.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-ink truncate">{t.title}</p>
                  <p className="text-[13px] text-ink-3 truncate">{t.detail}</p>
                </div>
                <ChevronRight className="size-4 text-ink-4" />
              </button>
            ))}
          </Card>
        </Section>
      )}

      {/* Spending trend */}
      <Section
        title="Spending"
        action={
          <button type="button" onClick={() => onNavigate('reports')} className="text-[13px] font-semibold text-brand-700">
            Reports
          </button>
        }
      >
        <Card>
          <div className="flex items-end justify-between gap-3 mb-4">
            <div>
              <p className="text-[13px] font-semibold text-ink-3">{monthName}</p>
              <Amount piastres={expenses} size="xl" className="mt-0.5" />
            </div>
            {trend.length > 1 && (
              <SpendDelta current={trend[trend.length - 1]?.expensesPiastres ?? 0} previous={trend[trend.length - 2]?.expensesPiastres ?? 0} />
            )}
          </div>
          <TrendChart data={trend} selected={{ year, month }} onSelect={sel.set} />
        </Card>
      </Section>

      {/* Where it went */}
      {categories.length > 0 && (
        <Section title="Where it went">
          <Card>
            <CategoryBreakdown items={categories} limit={4} />
            {categories.length > 4 && (
              <button type="button" onClick={() => onNavigate('reports')} className="mt-5 w-full text-center text-[13px] font-semibold text-brand-700">
                See all {categories.length} categories
              </button>
            )}
          </Card>
        </Section>
      )}

      {/* Budget */}
      <Section
        title="Budget"
        action={
          <button type="button" onClick={() => onNavigate('budgets')} className="text-[13px] font-semibold text-brand-700">
            {budget ? 'Manage' : 'Set up'}
          </button>
        }
      >
        {budget ? (
          <Card className="cursor-pointer" onClick={() => onNavigate('budgets')}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-ink-3">{budget.remainingPiastres >= 0 ? 'Left to spend' : 'Over budget by'}</p>
                <Amount piastres={Math.abs(budget.remainingPiastres)} size="lg" className={cx('mt-0.5', budget.remainingPiastres < 0 && '!text-expense')} />
              </div>
              <span className="num text-sm font-bold text-ink-2">{budget.percentage}%</span>
            </div>
            <ProgressBar value={budget.percentage} className="mt-3.5" />
            <p className="text-[13px] text-ink-3 mt-2.5 num">
              {formatEGP(budget.totalSpentPiastres)} of {formatEGP(budget.totalLimitPiastres)}
            </p>
          </Card>
        ) : (
          <Card className="flex items-center gap-4">
            <span className="size-11 rounded-[14px] bg-grad-soft text-brand-600 flex items-center justify-center shrink-0">
              <Target className="size-5" />
            </span>
            <p className="text-sm text-ink-2 flex-1">Set a monthly limit and Penny will tell you before you go over.</p>
          </Card>
        )}
      </Section>

      {/* Accounts */}
      <Section
        title="Accounts"
        action={
          <button type="button" onClick={() => onNavigate('accounts')} className="text-[13px] font-semibold text-brand-700">
            All accounts
          </button>
        }
      >
        <Card padded={false} className="py-1.5">
          {accounts?.map((a) => {
            const bal = balances?.get(a.id!) ?? a.openingBalance;
            return (
              <button key={a.id} type="button" onClick={() => onNavigate('accounts')} className="w-full flex items-center gap-3.5 px-4 py-3 text-left hover:bg-brand-50/60 transition-colors">
                <AccountIcon type={a.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-ink truncate">{a.name}</p>
                  <p className="text-[13px] text-ink-3">{ACCOUNT_TYPE_LABEL[a.type] ?? 'Account'}</p>
                </div>
                <Amount piastres={bal} className={bal < 0 ? '!text-expense' : undefined} />
              </button>
            );
          })}
        </Card>
      </Section>

      {/* Recent */}
      <Section
        title="Recent"
        action={
          recentTxns.length > 0 ? (
            <button type="button" onClick={() => onNavigate('transactions')} className="text-[13px] font-semibold text-brand-700">
              See all
            </button>
          ) : undefined
        }
      >
        <TransactionList
          transactions={recentTxns}
          compact
          onEdit={setEditing}
          onDelete={(id) => deleteTransaction(id)}
          emptyAction={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onAdd('expense')}>Add transaction</Button>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('import')}>Import SMS</Button>
            </div>
          }
        />
      </Section>

      {editing && (
        <AddTransactionForm
          editingTransaction={{ ...editing, id: editing.id! }}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
      {showDateFix && <DateFixSheet suggestions={misdated} onClose={() => setShowDateFix(false)} onApplied={() => findMisdatedTransactions().then(setMisdated)} />}
    </div>
  );
}

function SpendDelta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct > 0;
  return (
    <span className={cx('num inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-bold', up ? 'bg-expense-soft text-expense' : 'bg-income-soft text-income')}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}
      {Math.abs(pct)}% vs last month
    </span>
  );
}
