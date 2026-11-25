import { useState } from 'react';
import type { GoalProgress } from '../../services/budgets';
import { contributeToSavingsGoal } from '../../services/budgets';
import { formatEGP, toPiastres } from '../../utils/format';

interface Props {
  goal: GoalProgress;
  onClose: () => void;
  onContributed: () => void;
}

export function ContributeGoalModal({ goal, onClose, onContributed }: Props) {
  const [amountEgpStr, setAmountEgpStr] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const amountEgp = parseFloat(amountEgpStr) || 0;
  const addedPiastres = toPiastres(amountEgp);
  const newTotalPiastres = goal.currentAmountPiastres + addedPiastres;
  const newPercentage = goal.targetAmountPiastres > 0
    ? Math.min(100, Math.round((newTotalPiastres / goal.targetAmountPiastres) * 100))
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (amountEgp <= 0) {
      setError('Enter a valid positive amount');
      return;
    }

    setSaving(true);
    try {
      await contributeToSavingsGoal(goal.id, addedPiastres);
      onContributed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add funds');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-surface w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/10 pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{goal.icon}</span>
            <div>
              <h2 className="text-sm font-semibold">Add to Savings</h2>
              <p className="text-xs text-text-muted">{goal.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none p-1 cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-xs rounded-xl p-3">
              {error}
            </div>
          )}

          {/* Current progress snapshot */}
          <div className="bg-background rounded-xl p-3 border border-white/5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-text-muted">
              <span>Current Progress:</span>
              <span className="font-semibold text-text">
                {formatEGP(goal.currentAmountPiastres)} of {formatEGP(goal.targetAmountPiastres)} ({goal.percentage}%)
              </span>
            </div>
            {amountEgp > 0 && (
              <div className="flex items-center justify-between text-success pt-1 border-t border-white/5 font-semibold">
                <span>New Total:</span>
                <span>
                  {formatEGP(newTotalPiastres)} ({newPercentage}%)
                </span>
              </div>
            )}
          </div>

          {/* Amount input */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Contribution Amount (EGP)</label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="1"
                value={amountEgpStr}
                onChange={(e) => setAmountEgpStr(e.target.value)}
                placeholder="e.g. 500"
                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-base font-bold text-primary focus:ring-1 focus:ring-primary focus:outline-none"
                autoFocus
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted font-medium">
                EGP
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs bg-surface-light text-text-muted hover:text-text font-medium py-2 px-4 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || amountEgp <= 0}
              className="text-xs bg-primary text-white font-medium py-2 px-5 rounded-xl hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-40"
            >
              {saving ? 'Adding...' : 'Confirm Contribution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
