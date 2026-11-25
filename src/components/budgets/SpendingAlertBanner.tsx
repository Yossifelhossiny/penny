import type { SpendingAlert } from '../../services/budgets';
import { formatEGP } from '../../utils/format';

interface Props {
  alerts: SpendingAlert[];
  onManageBudgets?: () => void;
}

export function SpendingAlertBanner({ alerts, onManageBudgets }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, idx) => (
        <div
          key={`${alert.categoryId}-${idx}`}
          className={`rounded-2xl p-3.5 border flex items-start gap-3 transition-all ${
            alert.type === 'exceeded'
              ? 'bg-danger/10 border-danger/30 text-danger'
              : 'bg-warning/10 border-warning/30 text-warning'
          }`}
        >
          <span className="text-xl shrink-0 mt-0.5">{alert.icon || (alert.type === 'exceeded' ? '🚨' : '⚠️')}</span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-xs truncate">{alert.title}</p>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                  alert.type === 'exceeded'
                    ? 'bg-danger/20 text-danger'
                    : 'bg-warning/20 text-warning'
                }`}
              >
                {alert.percentage}% used
              </span>
            </div>

            <p className="text-xs opacity-90 mt-0.5">{alert.message}</p>

            <div className="flex items-center justify-between text-[11px] mt-2 pt-1.5 border-t border-current/10">
              <span className="opacity-80">
                Spent {formatEGP(alert.spentPiastres)} of {formatEGP(alert.limitPiastres)}
              </span>

              {onManageBudgets && (
                <button
                  type="button"
                  onClick={onManageBudgets}
                  className="font-semibold underline cursor-pointer hover:opacity-100"
                >
                  Adjust Budget →
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
