import { useState } from 'react';
import type { Category } from '../../types';
import { setBudget, deleteBudget, toMonthKey } from '../../services/budgets';
import { toPiastres } from '../../utils/format';

interface Props {
  initialCategoryId?: number;
  initialLimitPiastres?: number;
  existingBudgetId?: number;
  monthKey?: string | null;
  categories: Category[];
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}

export function BudgetModal({
  initialCategoryId = 0,
  initialLimitPiastres,
  existingBudgetId,
  monthKey: initialMonthKey,
  categories,
  year,
  month,
  onClose,
  onSaved,
}: Props) {
  const isEditing = !!existingBudgetId;

  const [categoryId, setCategoryId] = useState<number>(initialCategoryId);
  const [limitEgpStr, setLimitEgpStr] = useState(
    initialLimitPiastres ? (initialLimitPiastres / 100).toString() : ''
  );
  const [isRecurring, setIsRecurring] = useState(!initialMonthKey);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const targetMonthKey = toMonthKey(year, month);
  const monthName = new Date(year, month, 1).toLocaleString('en', { month: 'long' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const limitEgp = parseFloat(limitEgpStr);
    if (isNaN(limitEgp) || limitEgp <= 0) {
      setError('Please enter a valid positive budget limit');
      return;
    }

    setSaving(true);
    try {
      const limitPiastres = toPiastres(limitEgp);
      const chosenMonthKey = isRecurring ? null : targetMonthKey;

      await setBudget({
        categoryId,
        limitPiastres,
        monthKey: chosenMonthKey,
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save budget');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingBudgetId) return;
    if (!confirm('Remove this budget limit?')) return;

    setDeleting(true);
    try {
      await deleteBudget(existingBudgetId);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete budget');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto border border-white/10 pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {isEditing ? 'Edit Spending Budget' : 'Set Spending Budget'}
          </h2>
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

          {/* Category Selection */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Budget Target</label>
            <select
              value={categoryId}
              disabled={isEditing}
              onChange={(e) => setCategoryId(parseInt(e.target.value, 10))}
              className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-60"
            >
              <option value={0}>🌐 Overall Monthly Spending (All Categories)</option>
              {expenseCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Limit in EGP */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Monthly Spending Limit (EGP)</label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="1"
                value={limitEgpStr}
                onChange={(e) => setLimitEgpStr(e.target.value)}
                placeholder="e.g. 3000"
                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-base font-bold text-primary focus:ring-1 focus:ring-primary focus:outline-none"
                autoFocus
              />
              <span className="absolute right-3 top-2.5 text-xs text-text-muted font-medium">
                EGP
              </span>
            </div>
          </div>

          {/* Recurring vs Specific Month */}
          <div className="bg-surface-light/40 rounded-xl p-3 border border-white/5 space-y-2 text-xs">
            <span className="text-[11px] text-text-muted uppercase font-semibold block">
              Budget Period
            </span>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="periodType"
                  checked={isRecurring}
                  onChange={() => setIsRecurring(true)}
                  className="text-primary"
                />
                <span>Recurring Monthly Default (Applies every month)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="periodType"
                  checked={!isRecurring}
                  onChange={() => setIsRecurring(false)}
                  className="text-primary"
                />
                <span>Only for {monthName} {year}</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-danger hover:text-red-400 font-medium py-2 px-3 rounded-xl border border-danger/20 hover:bg-danger/10 transition-colors cursor-pointer"
              >
                {deleting ? 'Removing...' : 'Remove Budget'}
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="text-xs bg-surface-light text-text-muted hover:text-text font-medium py-2 px-4 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="text-xs bg-primary text-white font-medium py-2 px-5 rounded-xl hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save Budget'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
