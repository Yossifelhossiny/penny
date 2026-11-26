import { TrendingDown, TrendingUp } from 'lucide-react';
import type { FinancialHealthInsights } from '../../services/insights';
import { Amount, cx } from '../ui';

function Change({ pct, goodWhenUp }: { pct: number | null; goodWhenUp: boolean }) {
  if (pct === null) return <span className="text-[12px] text-ink-3">No data last month</span>;
  const up = pct > 0;
  const good = up === goodWhenUp;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cx('inline-flex items-center gap-1 text-[12px] font-semibold num', pct === 0 ? 'text-ink-3' : good ? 'text-income' : 'text-expense')}>
      <Icon className="size-3.5" /> {up ? '+' : ''}{pct}% vs last month
    </span>
  );
}

/** Plain-language read of the month: what you kept, your daily pace, and the change from last month. */
export function MonthInsights({ insights }: { insights: FinancialHealthInsights }) {
  const rate = insights.incomePiastres > 0 ? insights.savingsRate : null;
  const verdict =
    rate === null
      ? 'No income recorded this month yet.'
      : rate >= 30
        ? 'You kept a strong share of your income.'
        : rate >= 10
          ? 'You’re saving — steady month.'
          : rate >= 0
            ? 'Most of your income went out this month.'
            : 'You spent more than you earned this month.';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative size-[68px] shrink-0">
          <svg viewBox="0 0 36 36" className="size-full -rotate-90">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#9678ED" />
                <stop offset="100%" stopColor="#5034A8" />
              </linearGradient>
            </defs>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f1eef6" strokeWidth="4" />
            <circle
              cx="18" cy="18" r="15.5" fill="none" stroke="url(#ringGrad)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(100, rate ?? 0)) * 0.974} 100`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center num text-sm font-bold text-ink">
            {rate === null ? '—' : `${Math.round(rate)}%`}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink-3">Saved of income</p>
          <p className="text-[15px] font-semibold text-ink mt-0.5">{verdict}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-well/70 p-3.5">
          <p className="text-[12px] font-semibold text-ink-3">Daily spending</p>
          <Amount piastres={insights.averageDailyBurnPiastres} size="lg" hideFraction className="mt-1" />
          <div className="mt-1"><Change pct={insights.previousMonthComparison.expenseChangePct} goodWhenUp={false} /></div>
        </div>
        <div className="rounded-2xl bg-well/70 p-3.5">
          <p className="text-[12px] font-semibold text-ink-3">Biggest category</p>
          <p className="text-[15px] font-bold text-ink mt-1.5 truncate">{insights.topCategory?.name ?? '—'}</p>
          <p className="text-[12px] text-ink-3 mt-1 num">
            {insights.topCategory ? `${Math.round(insights.topCategory.percentage)}% of spending` : 'No spending yet'}
          </p>
        </div>
      </div>
    </div>
  );
}
