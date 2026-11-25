import type { FinancialHealthInsights } from '../../services/insights';
import { formatEGP } from '../../utils/format';

interface Props {
  insights: FinancialHealthInsights;
  monthName: string;
}

export function FinancialHealthCard({ insights, monthName }: Props) {
  const savingsRate = Math.max(0, insights.savingsRate);

  let healthStatus = 'Neutral';
  let healthColor = 'text-text-muted';
  let healthBadge = 'bg-surface-light text-text-muted';

  if (insights.incomePiastres > 0) {
    if (savingsRate >= 30) {
      healthStatus = 'Excellent Savings';
      healthColor = 'text-primary';
      healthBadge = 'bg-primary/15 text-primary';
    } else if (savingsRate >= 15) {
      healthStatus = 'Healthy Savings';
      healthColor = 'text-success';
      healthBadge = 'bg-success/15 text-success';
    } else if (savingsRate > 0) {
      healthStatus = 'Moderate Savings';
      healthColor = 'text-warning';
      healthBadge = 'bg-warning/15 text-warning';
    } else {
      healthStatus = 'Deficit (Spending > Income)';
      healthColor = 'text-danger';
      healthBadge = 'bg-danger/15 text-danger';
    }
  }

  const expChange = insights.previousMonthComparison.expenseChangePct;
  const incChange = insights.previousMonthComparison.incomeChangePct;

  return (
    <div className="bg-surface rounded-2xl p-4 border border-white/5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text">Financial Health & Insights</h3>
          <p className="text-xs text-text-muted mt-0.5">Key takeaways for {monthName}</p>
        </div>
        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${healthBadge}`}>
          {healthStatus}
        </span>
      </div>

      {/* Grid of Key Insights */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Savings Rate Card */}
        <div className="bg-surface-light/40 rounded-xl p-3 space-y-1.5 border border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">Savings Rate</span>
            <span className="text-xs">📈</span>
          </div>
          <p className={`text-xl font-bold ${healthColor}`}>
            {insights.incomePiastres > 0 ? `${savingsRate}%` : '0%'}
          </p>
          <div className="h-1.5 w-full bg-surface-light rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, savingsRate))}%` }}
            />
          </div>
          <p className="text-[10px] text-text-muted">
            {insights.netSavingsPiastres >= 0
              ? `Saved ${formatEGP(insights.netSavingsPiastres)}`
              : `Deficit: ${formatEGP(Math.abs(insights.netSavingsPiastres))}`}
          </p>
        </div>

        {/* Daily Burn Rate */}
        <div className="bg-surface-light/40 rounded-xl p-3 space-y-1.5 border border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">Daily Burn Rate</span>
            <span className="text-xs">🗓️</span>
          </div>
          <p className="text-xl font-bold text-text">
            {formatEGP(insights.averageDailyBurnPiastres)}
          </p>
          <p className="text-[10px] text-text-muted pt-2.5">
            Average spent per day in {monthName}
          </p>
        </div>
      </div>

      {/* Highlights & Top Category */}
      <div className="space-y-2 pt-1 border-t border-white/5 text-xs">
        {/* Top Spending Category Highlight */}
        {insights.topCategory ? (
          <div className="flex items-center gap-2 bg-surface-light/30 rounded-xl p-2.5">
            <span className="text-xl shrink-0">{insights.topCategory.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-text">
                Top Spending: {insights.topCategory.name}
              </p>
              <p className="text-[11px] text-text-muted">
                {formatEGP(insights.topCategory.amountPiastres)} ({insights.topCategory.percentage}% of all expenses)
              </p>
            </div>
          </div>
        ) : (
          <div className="text-text-muted text-[11px] py-1">
            No spending recorded yet this month.
          </div>
        )}

        {/* MoM Comparison Pills */}
        {(expChange !== null || incChange !== null) && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
            {expChange !== null && (
              <span
                className={`px-2 py-1 rounded-lg font-medium inline-flex items-center gap-1 ${
                  expChange <= 0
                    ? 'bg-success/15 text-success'
                    : 'bg-warning/15 text-warning'
                }`}
              >
                <span>{expChange <= 0 ? '↓' : '↑'}</span>
                <span>
                  Expenses {Math.abs(expChange)}% {expChange <= 0 ? 'lower' : 'higher'} than last month
                </span>
              </span>
            )}

            {incChange !== null && (
              <span
                className={`px-2 py-1 rounded-lg font-medium inline-flex items-center gap-1 ${
                  incChange >= 0
                    ? 'bg-success/15 text-success'
                    : 'bg-danger/15 text-danger'
                }`}
              >
                <span>{incChange >= 0 ? '↑' : '↓'}</span>
                <span>
                  Income {Math.abs(incChange)}% {incChange >= 0 ? 'higher' : 'lower'} than last month
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
