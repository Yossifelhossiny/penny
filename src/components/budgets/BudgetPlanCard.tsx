import { useEffect, useState } from 'react';
import { PiggyBank } from 'lucide-react';
import { getBudgetPlan, SAVINGS_TARGET, type BudgetPlan } from '../../services/advice';
import { formatEGP } from '../../utils/format';
import { Amount, Card, cx } from '../ui';

const SOURCE: Record<BudgetPlan['incomeSource'], string> = {
  recurring: 'your monthly income',
  average: 'your average income (last 3 months)',
  'this-month': 'this month’s income so far',
  none: '',
};

/** Adds up your budgets and says what's left to save against your income. */
export function BudgetPlanCard({ year, month, version }: { year: number; month: number; version?: unknown }) {
  const [plan, setPlan] = useState<BudgetPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBudgetPlan(year, month).then((p) => !cancelled && setPlan(p));
    return () => {
      cancelled = true;
    };
  }, [year, month, version]);

  if (!plan || plan.verdict === 'no-budget') return null;

  const tone =
    plan.verdict === 'on-target' ? 'text-income' : plan.verdict === 'over-income' ? 'text-expense' : plan.verdict === 'below-target' ? 'text-caution' : 'text-ink-2';
  const headline =
    plan.verdict === 'no-income'
      ? 'Add your income to see what you’ll save'
      : plan.verdict === 'over-income'
        ? 'Your budgets are more than you earn'
        : plan.verdict === 'below-target'
          ? `You’ll save ${Math.round(plan.savingsRate ?? 0)}% — below the ${SAVINGS_TARGET}% target`
          : `You’ll save ${Math.round(plan.savingsRate ?? 0)}% of your income`;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3.5">
        <span className="size-11 rounded-[14px] bg-grad-soft text-brand-700 flex items-center justify-center shrink-0">
          <PiggyBank className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink-3">Budget plan</p>
          <p className={cx('text-[15px] font-bold mt-0.5', tone)}>{headline}</p>
        </div>
      </div>

      <dl className="rounded-2xl bg-well/70 px-4 py-1">
        {[
          ['Expected income', plan.incomePiastres > 0 ? formatEGP(plan.incomePiastres) : '—'],
          [plan.hasOverallLimit ? 'Overall limit' : 'All budgets added up', formatEGP(plan.plannedSpendingPiastres)],
          ...(plan.hasOverallLimit && plan.categoryLimitsPiastres > 0 ? [['Category limits total', formatEGP(plan.categoryLimitsPiastres)]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-3 [&+&]:border-t [&+&]:border-hairline">
            <dt className="text-sm text-ink-3">{k}</dt>
            <dd className="text-sm font-semibold text-ink num">{v}</dd>
          </div>
        ))}
        {plan.incomePiastres > 0 && (
          <div className="flex justify-between gap-4 py-3 border-t border-hairline">
            <dt className="text-sm font-semibold text-ink">{plan.plannedSavingsPiastres >= 0 ? 'Left to save' : 'Short by'}</dt>
            <dd>
              <Amount piastres={Math.abs(plan.plannedSavingsPiastres)} size="sm" className={plan.plannedSavingsPiastres < 0 ? '!text-expense' : '!text-income'} />
            </dd>
          </div>
        )}
      </dl>

      {plan.trimToTargetPiastres > 0 && (
        <p className="text-[13px] text-ink-2">
          Lower your limits by <span className="font-semibold num">{formatEGP(plan.trimToTargetPiastres)}</span> to keep {SAVINGS_TARGET}% of your income — the 50/30/20 rule’s savings share.
        </p>
      )}
      {plan.incomeSource !== 'none' && <p className="text-[12px] text-ink-3">Income based on {SOURCE[plan.incomeSource]}.</p>}
    </Card>
  );
}
