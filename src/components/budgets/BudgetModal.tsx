import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Category } from '../../types';
import { setBudget, deleteBudget, toMonthKey } from '../../services/budgets';
import { toPiastres } from '../../utils/format';
import { monthLabel } from '../../utils/months';
import { AmountInput, Banner, Button, ConfirmSheet, Field, Segmented, Select, Sheet } from '../ui';

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

export function BudgetModal({ initialCategoryId = 0, initialLimitPiastres, existingBudgetId, monthKey, categories, year, month, onClose, onSaved }: Props) {
  const isEditing = !!existingBudgetId;
  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const validInitial = initialCategoryId === 0 || expenseCategories.some((c) => c.id === initialCategoryId);
  const [categoryId, setCategoryId] = useState<number>(validInitial ? initialCategoryId : (expenseCategories[0]?.id ?? 0));
  const [limitStr, setLimitStr] = useState(initialLimitPiastres ? (initialLimitPiastres / 100).toString() : '');
  const [scope, setScope] = useState<'every' | 'this'>(monthKey ? 'this' : 'every');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const monthName = monthLabel(year, month);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const limit = parseFloat(limitStr);
    if (isNaN(limit) || limit <= 0) return setError('Enter a limit greater than zero');
    setSaving(true);
    try {
      await setBudget({ categoryId, limitPiastres: toPiastres(limit), monthKey: scope === 'this' ? toMonthKey(year, month) : null });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the budget');
    } finally {
      setSaving(false);
    }
  }

  if (confirmDelete && existingBudgetId) {
    return (
      <ConfirmSheet
        title="Remove this budget?"
        message="Your spending stays as it is. You just won’t get warnings for it."
        confirmLabel="Remove"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteBudget(existingBudgetId);
          onSaved();
          onClose();
        }}
      />
    );
  }

  return (
    <Sheet
      title={isEditing ? 'Edit budget' : 'New budget'}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button type="submit" form="budget-form" size="lg" block loading={saving}>
            {isEditing ? 'Save changes' : 'Set budget'}
          </Button>
          {isEditing && (
            <Button variant="ghost" block className="!text-expense" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
              Remove budget
            </Button>
          )}
        </div>
      }
    >
      <form id="budget-form" onSubmit={handleSubmit} className="space-y-5">
        <Field label="Limit for">
          <Select value={categoryId} disabled={isEditing} onChange={(e) => setCategoryId(parseInt(e.target.value, 10))}>
            <option value={0}>All spending</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Monthly limit">
          <AmountInput value={limitStr} onChange={(e) => setLimitStr(e.target.value)} aria-label="Monthly limit in EGP" autoFocus={!isEditing} />
        </Field>

        <Field label="Applies to" hint={scope === 'every' ? 'Repeats every month until you change it.' : `Only for ${monthName}. Other months keep their usual limit.`}>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'every', label: 'Every month' },
              { value: 'this', label: `${monthName} only` },
            ]}
          />
        </Field>

        {error && <Banner tone="error">{error}</Banner>}
      </form>
    </Sheet>
  );
}
