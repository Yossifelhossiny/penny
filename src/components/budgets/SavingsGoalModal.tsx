import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { SavingsGoal } from '../../types';
import { createSavingsGoal, updateSavingsGoal, deleteSavingsGoal } from '../../services/budgets';
import { toPiastres, toLocalDateInput, parseLocalDateInput } from '../../utils/format';
import { Banner, Button, ConfirmSheet, Field, Sheet, TextInput } from '../ui';

interface Props {
  goal?: SavingsGoal;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

export function SavingsGoalModal({ goal, onClose, onSaved, onDeleted }: Props) {
  const isEditing = !!goal;
  const [name, setName] = useState(goal?.name ?? '');
  const [targetStr, setTargetStr] = useState(goal ? (goal.targetAmountPiastres / 100).toString() : '');
  const [savedStr, setSavedStr] = useState(goal ? (goal.currentAmountPiastres / 100).toString() : '');
  const [dateStr, setDateStr] = useState(goal?.targetDate ? toLocalDateInput(new Date(goal.targetDate)) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Give your goal a name');
    const target = parseFloat(targetStr);
    if (isNaN(target) || target <= 0) return setError('Enter a target greater than zero');
    const saved = savedStr.trim() === '' ? 0 : parseFloat(savedStr);
    if (isNaN(saved) || saved < 0) return setError('Saved so far can’t be negative');

    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        targetAmountPiastres: toPiastres(target),
        currentAmountPiastres: toPiastres(saved),
        targetDate: dateStr ? parseLocalDateInput(dateStr) : null,
        // Legacy display fields kept for older versions; the UI derives its own look.
        icon: goal?.icon ?? '🎯',
        color: goal?.color ?? '#7253d6',
      };
      if (isEditing) await updateSavingsGoal(goal.id!, data);
      else await createSavingsGoal(data);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the goal');
    } finally {
      setSaving(false);
    }
  }

  if (confirmDelete && goal?.id) {
    return (
      <ConfirmSheet
        title={`Delete “${goal.name}”?`}
        message="The goal and its progress will be removed. Your transactions aren’t affected."
        confirmLabel="Delete goal"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteSavingsGoal(goal.id!);
          onDeleted?.();
          onClose();
        }}
      />
    );
  }

  return (
    <Sheet
      title={isEditing ? 'Edit goal' : 'New savings goal'}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button type="submit" form="goal-form" size="lg" block loading={saving}>
            {isEditing ? 'Save changes' : 'Create goal'}
          </Button>
          {isEditing && (
            <Button variant="ghost" block className="!text-expense" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
              Delete goal
            </Button>
          )}
        </div>
      }
    >
      <form id="goal-form" onSubmit={handleSubmit} className="space-y-5">
        <Field label="Goal">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" autoFocus={!isEditing} maxLength={40} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target (EGP)">
            <TextInput type="number" inputMode="decimal" min="0" step="0.01" value={targetStr} onChange={(e) => setTargetStr(e.target.value)} placeholder="0" className="num" />
          </Field>
          <Field label="Saved so far">
            <TextInput type="number" inputMode="decimal" min="0" step="0.01" value={savedStr} onChange={(e) => setSavedStr(e.target.value)} placeholder="0" className="num" />
          </Field>
        </div>
        <Field label="Target date" hint="Optional — Penny will count down the days.">
          <TextInput type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
      </form>
    </Sheet>
  );
}
