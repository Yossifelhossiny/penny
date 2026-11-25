import { useState } from 'react';
import type { Account } from '../../types';
import { reconcileAccountBalance } from '../../services/accounts';
import { formatEGP, toPiastres } from '../../utils/format';

interface Props {
  account: Account;
  currentBalancePiastres: number;
  onClose: () => void;
  onReconciled: () => void;
}

export function ReconcileModal({
  account,
  currentBalancePiastres,
  onClose,
  onReconciled,
}: Props) {
  const [actualBalanceStr, setActualBalanceStr] = useState(
    (currentBalancePiastres / 100).toFixed(2)
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parsedActual = parseFloat(actualBalanceStr);
  const isValidNumber = !isNaN(parsedActual) && parsedActual >= 0;
  const actualPiastres = isValidNumber ? toPiastres(parsedActual) : currentBalancePiastres;
  const discrepancy = actualPiastres - currentBalancePiastres;

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!isValidNumber) {
      setError('Please enter a valid actual balance');
      return;
    }

    setSaving(true);
    try {
      await reconcileAccountBalance(account.id!, actualPiastres, note || undefined);
      onReconciled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reconcile balance');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto border border-white/10 pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚖️</span>
            <div>
              <h2 className="text-base font-semibold">Reconcile Balance</h2>
              <p className="text-xs text-text-muted">{account.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none p-1 cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleConfirm} className="p-4 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-xs rounded-xl p-3">
              {error}
            </div>
          )}

          {/* Current vs Actual comparison */}
          <div className="bg-background rounded-xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Recorded Balance (Penny)</span>
              <span className="text-sm font-semibold text-text">
                {formatEGP(currentBalancePiastres)}
              </span>
            </div>

            <div className="pt-2 border-t border-white/5">
              <label className="text-xs text-text-muted block mb-1">
                Actual Balance (from Bank app / SMS snapshot)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={actualBalanceStr}
                  onChange={(e) => setActualBalanceStr(e.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 text-base font-bold text-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  autoFocus
                />
                <span className="absolute right-3 top-2.5 text-xs text-text-muted font-medium">
                  EGP
                </span>
              </div>
            </div>
          </div>

          {/* Discrepancy Indicator */}
          <div
            className={`rounded-xl p-3 text-xs border ${
              discrepancy === 0
                ? 'bg-success/10 border-success/30 text-success'
                : discrepancy > 0
                ? 'bg-primary/10 border-primary/30 text-primary-light'
                : 'bg-warning/10 border-warning/30 text-warning'
            }`}
          >
            <div className="flex items-center justify-between font-semibold">
              <span>Discrepancy</span>
              <span>
                {discrepancy === 0
                  ? 'No difference'
                  : `${discrepancy > 0 ? '+' : ''}${formatEGP(discrepancy)}`}
              </span>
            </div>
            <p className="mt-1 opacity-90">
              {discrepancy === 0
                ? 'Your recorded transactions match your actual balance.'
                : discrepancy > 0
                ? `Actual balance is higher. Penny will create a +${formatEGP(discrepancy)} Income adjustment transaction.`
                : `Actual balance is lower. Penny will create a -${formatEGP(Math.abs(discrepancy))} Expense adjustment transaction.`}
            </p>
          </div>

          {/* Note input */}
          {discrepancy !== 0 && (
            <div>
              <label className="text-xs text-text-muted block mb-1">
                Adjustment Note (Optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Monthly statement reconciliation"
                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          )}

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
              disabled={saving || !isValidNumber}
              className="text-xs bg-primary text-white font-medium py-2 px-5 rounded-xl hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-40"
            >
              {saving
                ? 'Saving...'
                : discrepancy === 0
                ? 'Done (Already Matched)'
                : 'Apply Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
