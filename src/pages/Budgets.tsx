import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Flag, Plus, Target } from 'lucide-react';
import { db } from '../db';
import type { Page } from '../types';
import {
  getBudgetsWithProgress,
  getOverallBudgetProgress,
  getSavingsGoalsWithProgress,
  toMonthKey,
  type BudgetProgress,
  type OverallBudgetProgress,
  type GoalProgress,
} from '../services/budgets';
import { formatEGP } from '../utils/format';
import { useMonthSelection } from '../hooks/useMonthSelection';
import { BudgetModal } from '../components/budgets/BudgetModal';
import { SavingsGoalModal } from '../components/budgets/SavingsGoalModal';
import { ContributeGoalModal } from '../components/budgets/ContributeGoalModal';
import { BudgetPlanCard } from '../components/budgets/BudgetPlanCard';
import { Amount, Badge, Button, Card, CategoryIcon, EmptyState, IconButton, MonthSwitcher, PageHeader, ProgressBar, Section, Segmented, cx } from '../components/ui';

interface Props {
  onNavigate?: (page: Page) => void;
}

type Tab = 'budgets' | 'goals';

export function Budgets({ onNavigate }: Props) {
  const sel = useMonthSelection();
  const { year, month } = sel;
  const [tab, setTab] = useState<Tab>('budgets');

  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [overall, setOverall] = useState<OverallBudgetProgress | null>(null);
  const [goals, setGoals] = useState<GoalProgress[]>([]);
  const [editingBudget, setEditingBudget] = useState<{ id?: number; categoryId: number; limitPiastres: number; monthKey?: string | null } | null>(null);
  const [editingGoal, setEditingGoal] = useState<GoalProgress | null | 'new'>(null);
  const [contributeGoal, setContributeGoal] = useState<GoalProgress | null>(null);

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const allTxns = useLiveQuery(() => db.transactions.toArray());
  const allBudgets = useLiveQuery(() => db.budgets.toArray());
  const allGoals = useLiveQuery(() => db.goals.toArray());

  const reloadBudgets = () => {
    getBudgetsWithProgress(year, month).then(setBudgets);
    getOverallBudgetProgress(year, month).then(setOverall);
  };

  useEffect(() => {
    if (allTxns === undefined || allBudgets === undefined) return;
    let cancelled = false;
    getBudgetsWithProgress(year, month).then((v) => !cancelled && setBudgets(v));
    getOverallBudgetProgress(year, month).then((v) => !cancelled && setOverall(v));
    return () => {
      cancelled = true;
    };
  }, [allTxns, allBudgets, year, month]);

  useEffect(() => {
    if (allGoals === undefined) return;
    getSavingsGoalsWithProgress().then(setGoals);
  }, [allGoals]);

  const totalSaved = goals.reduce((s, g) => s + g.currentAmountPiastres, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmountPiastres, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        leading={
          onNavigate && (
            <IconButton label="Back to home" onClick={() => onNavigate('dashboard')} className="-ml-2.5 mt-[-2px]">
              <ArrowLeft className="size-5" />
            </IconButton>
          )
        }
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="size-4" />}
            onClick={() => (tab === 'budgets' ? setEditingBudget({ categoryId: -1, limitPiastres: 0 }) : setEditingGoal('new'))}
          >
            {tab === 'budgets' ? 'Budget' : 'Goal'}
          </Button>
        }
      />

      <Segmented
        label="Section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'budgets', label: 'Monthly limits' },
          { value: 'goals', label: 'Savings goals' },
        ]}
      />

      {tab === 'budgets' ? (
        <div className="space-y-6">
          <MonthSwitcher sel={sel} />

          {/* Overall */}
          <Card className={cx(overall && 'bg-grad-hero text-white shadow-raised')}>
            {overall ? (
              <button type="button" className="w-full text-left" onClick={() => {
                  const key = toMonthKey(year, month);
                  const own = allBudgets?.find((b) => b.categoryId === 0 && b.monthKey === key) ?? allBudgets?.find((b) => b.categoryId === 0 && !b.monthKey);
                  setEditingBudget({ id: own?.id, categoryId: 0, limitPiastres: own?.limitPiastres ?? 0, monthKey: own?.monthKey });
                }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-white/75">{overall.remainingPiastres >= 0 ? 'Left to spend' : 'Over budget by'}</p>
                    <Amount piastres={Math.abs(overall.remainingPiastres)} tone="inverse" size="xl" className="mt-1" />
                  </div>
                  <span className="num text-sm font-bold bg-white/15 rounded-full px-2.5 h-7 inline-flex items-center">{overall.percentage}%</span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className={cx('h-full rounded-full', overall.status === 'exceeded' ? 'bg-[#ffb3bd]' : overall.status === 'warning' ? 'bg-[#ffd58a]' : 'bg-white')}
                    style={{ width: `${Math.min(100, overall.percentage)}%` }}
                  />
                </div>
                <p className="text-[13px] text-white/75 mt-3 num">
                  {formatEGP(overall.totalSpentPiastres)} spent of {formatEGP(overall.totalLimitPiastres)} · {overall.isCustomOverall ? 'overall limit' : 'sum of category limits'}
                </p>
              </button>
            ) : (
              <EmptyState
                className="py-4"
                icon={<Target />}
                title="No monthly limit yet"
                message="Set one overall limit, or limits per category. Penny warns you at 80%."
                action={<Button onClick={() => setEditingBudget({ categoryId: 0, limitPiastres: 0 })}>Set a monthly limit</Button>}
              />
            )}
          </Card>

          <BudgetPlanCard year={year} month={month} version={allBudgets} />

          <Section title="By category">
            {budgets.length === 0 ? (
              <Card>
                <p className="text-sm text-ink-3 text-center py-3">Add limits for categories like Food or Shopping to see them here.</p>
                <div className="flex justify-center">
                  <Button size="sm" variant="secondary" onClick={() => setEditingBudget({ categoryId: -1, limitPiastres: 0 })}>Add category limit</Button>
                </div>
              </Card>
            ) : (
              <Card padded={false} className="py-2">
                {budgets.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setEditingBudget({ id: b.id, categoryId: b.categoryId, limitPiastres: b.limitPiastres, monthKey: b.monthKey })}
                    className="w-full px-4 py-3 text-left hover:bg-brand-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <CategoryIcon category={{ name: b.categoryName, type: 'expense' }} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[15px] font-semibold text-ink truncate">{b.categoryName}</p>
                          {b.monthKey && <Badge>This month</Badge>}
                        </div>
                        <p className="text-[13px] text-ink-3 num">
                          {b.remainingPiastres >= 0 ? `${formatEGP(b.remainingPiastres)} left` : `${formatEGP(-b.remainingPiastres)} over`} · of {formatEGP(b.limitPiastres)}
                        </p>
                      </div>
                      <span className={cx('num text-sm font-bold', b.status === 'exceeded' ? 'text-expense' : b.status === 'warning' ? 'text-caution' : 'text-ink-2')}>
                        {b.percentage}%
                      </span>
                    </div>
                    <ProgressBar value={b.percentage} className="mt-2.5 ml-11" />
                  </button>
                ))}
              </Card>
            )}
          </Section>
        </div>
      ) : (
        <div className="space-y-6">
          {goals.length > 0 && (
            <Card className="bg-grad-soft shadow-none">
              <p className="text-[13px] font-semibold text-brand-800/70">Saved toward goals</p>
              <Amount piastres={totalSaved} size="xl" className="mt-1 !text-brand-900" />
              <p className="text-[13px] text-brand-800/70 mt-1 num">of {formatEGP(totalTarget)} across {goals.length} {goals.length === 1 ? 'goal' : 'goals'}</p>
            </Card>
          )}

          {goals.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Flag />}
                title="No savings goals"
                message="An emergency fund, a trip, a new laptop — give it a target and watch it fill."
                action={<Button onClick={() => setEditingGoal('new')}>Create a goal</Button>}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {goals.map((g) => (
                <Card key={g.id}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => setEditingGoal(g)} className="text-left min-w-0">
                      <p className="text-[15px] font-semibold text-ink truncate">{g.name}</p>
                      <p className="text-[13px] text-ink-3 mt-0.5">
                        {g.isCompleted
                          ? 'Target reached'
                          : g.daysRemaining == null
                            ? `${formatEGP(g.remainingPiastres)} to go`
                            : g.daysRemaining > 0
                              ? `${formatEGP(g.remainingPiastres)} to go · ${g.daysRemaining} days left`
                              : g.daysRemaining === 0
                                ? 'Target date is today'
                                : `Target date passed ${Math.abs(g.daysRemaining)} days ago`}
                      </p>
                    </button>
                    {g.isCompleted ? <Badge tone="income">Done</Badge> : <span className="num text-sm font-bold text-brand-700">{g.percentage}%</span>}
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-3">
                    <Amount piastres={g.currentAmountPiastres} size="lg" hideFraction />
                    <span className="text-[13px] text-ink-3 num">of {formatEGP(g.targetAmountPiastres)}</span>
                  </div>
                  <ProgressBar value={g.percentage} tone="brand" className="mt-3" />
                  {!g.isCompleted && (
                    <Button variant="secondary" size="sm" block className="mt-4" icon={<Plus className="size-4" />} onClick={() => setContributeGoal(g)}>
                      Add money
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {editingBudget && (
        <BudgetModal
          initialCategoryId={editingBudget.categoryId}
          initialLimitPiastres={editingBudget.limitPiastres}
          existingBudgetId={editingBudget.id}
          monthKey={editingBudget.monthKey}
          categories={categories}
          year={year}
          month={month}
          onClose={() => setEditingBudget(null)}
          onSaved={reloadBudgets}
        />
      )}
      {editingGoal && (
        <SavingsGoalModal
          goal={editingGoal === 'new' ? undefined : editingGoal}
          onClose={() => setEditingGoal(null)}
          onSaved={() => getSavingsGoalsWithProgress().then(setGoals)}
          onDeleted={() => getSavingsGoalsWithProgress().then(setGoals)}
        />
      )}
      {contributeGoal && (
        <ContributeGoalModal goal={contributeGoal} onClose={() => setContributeGoal(null)} onContributed={() => getSavingsGoalsWithProgress().then(setGoals)} />
      )}
    </div>
  );
}
