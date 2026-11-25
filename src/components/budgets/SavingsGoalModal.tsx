import { useState } from 'react';
import type { SavingsGoal } from '../../types';
import { createSavingsGoal, updateSavingsGoal, deleteSavingsGoal } from '../../services/budgets';
import { toPiastres, toLocalDateInput, parseLocalDateInput } from '../../utils/format';

interface Props {
  goal?: SavingsGoal;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const GOAL_ICONS = ['🎯', '🛡️', '🏖️', '💻', '🚗', '🏠', '💍', '✈️', '🎓', '📱', '🪙', '💎'];
const GOAL_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#64748b'];

export function SavingsGoalModal({ goal, onClose, onSaved, onDeleted }: Props) {
  const isEditing = !!goal;

  const [name, setName] = useState(goal?.name ?? '');
  const [targetEgpStr, setTargetEgpStr] = useState(
    goal ? (goal.targetAmountPiastres / 100).toString() : ''
  );
  const [currentEgpStr, setCurrentEgpStr] = useState(
    goal ? (goal.currentAmountPiastres / 100).toString() : '0'
  );
  const [targetDateStr, setTargetDateStr] = useState(
    goal?.targetDate ? toLocalDateInput(new Date(goal.targetDate)) : ''
  );
  const [icon, setIcon] = useState(goal?.icon ?? GOAL_ICONS[0]);
  const [color, setColor] = useState(goal?.color ?? GOAL_COLORS[0]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter a goal name');
      return;
    }

    const targetEgp = parseFloat(targetEgpStr);
    if (isNaN(targetEgp) || targetEgp <= 0) {
      setError('Target amount must be a positive number');
      return;
    }

    const currentEgp = parseFloat(currentEgpStr);
    if (isNaN(currentEgp) || currentEgp < 0) {
      setError('Saved amount must be non-negative');
      return;
    }

    setSaving(true);
    try {
      const targetPiastres = toPiastres(targetEgp);
      const currentPiastres = toPiastres(currentEgp);
      const targetDate = targetDateStr ? parseLocalDateInput(targetDateStr) : null;

      if (isEditing) {
        await updateSavingsGoal(goal.id!, {
          name: name.trim(),
          targetAmountPiastres: targetPiastres,
          currentAmountPiastres: currentPiastres,
          targetDate,
          icon,
          color,
        });
      } else {
        await createSavingsGoal({
          name: name.trim(),
          targetAmountPiastres: targetPiastres,
          currentAmountPiastres: currentPiastres,
          targetDate,
          icon,
          color,
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save savings goal');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!goal?.id) return;
    if (!confirm(`Delete savings goal "${goal.name}"?`)) return;

    setDeleting(true);
    try {
      await deleteSavingsGoal(goal.id);
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete goal');
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
            {isEditing ? 'Edit Savings Goal' : 'Create Savings Goal'}
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

          {/* Icon Picker */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted block">Goal Icon</label>
            <div className="flex flex-wrap gap-2">
              {GOAL_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all cursor-pointer ${
                    icon === i
                      ? 'bg-surface-light border-2 border-primary scale-105'
                      : 'bg-surface-light/40 border border-white/5 hover:bg-surface-light'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Goal Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency Fund, New Car, Vacation"
              className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              autoFocus
            />
          </div>

          {/* Target Amount & Current Amount */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs text-text-muted block mb-1">Target Amount (EGP)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={targetEgpStr}
                onChange={(e) => setTargetEgpStr(e.target.value)}
                placeholder="e.g. 50000"
                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Saved So Far (EGP)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={currentEgpStr}
                onChange={(e) => setCurrentEgpStr(e.target.value)}
                placeholder="0"
                className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Target Date */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Target Date (Optional)</label>
            <input
              type="date"
              value={targetDateStr}
              onChange={(e) => setTargetDateStr(e.target.value)}
              className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Color Picker */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Color Accent</label>
            <div className="flex items-center gap-2">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full transition-all cursor-pointer ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-surface scale-110' : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-3">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-danger hover:text-red-400 font-medium py-2 px-3 rounded-xl border border-danger/20 hover:bg-danger/10 transition-colors cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Delete Goal'}
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
                {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Goal'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
