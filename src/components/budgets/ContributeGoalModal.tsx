import { useState } from 'react';
import type { GoalProgress } from '../../services/budgets';
import { contributeToSavingsGoal } from '../../services/budgets';
import { formatEGP, toPiastres } from '../../utils/format';
import { AmountInput, Banner, Button, ProgressBar, Sheet } from '../ui';

interface Props {
  goal: GoalProgress;
  onClose: () => void;
  onContributed: () => void;
}

export function ContributeGoalModal({ goal, onClose, onContributed }: Props) {
  const [amountStr, setAmountStr] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const amount = parseFloat(amountStr) || 0;
  const added = toPiastres(amount);
  const newTotal = goal.currentAmountPiastres + added;
  const newPct = goal.targetAmountPiastres > 0 ? Math.min(100, Math.round((newTotal / goal.targetAmountPiastres) * 100)) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (amount <= 0) return setError('Enter an amount greater than zero');
    setSaving(true);
    try {
      await contributeToSavingsGoal(goal.id, added);
      onContributed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to the goal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={`Add to ${goal.name}`}
      onClose={onClose}
      footer={
        <Button type="submit" form="contribute-form" size="lg" block loading={saving} disabled={amount <= 0}>
          Add {amount > 0 ? formatEGP(added) : ''}
        </Button>
      }
    >
      <form id="contribute-form" onSubmit={handleSubmit} className="space-y-4">
        <AmountInput value={amountStr} onChange={(e) => setAmountStr(e.target.value)} aria-label="Amount to add" autoFocus />
        <div className="rounded-2xl bg-well/70 p-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-ink-3">{amount > 0 ? 'After this' : 'Saved so far'}</span>
            <span className="num font-semibold text-ink">{formatEGP(amount > 0 ? newTotal : goal.currentAmountPiastres)} <span className="text-ink-3 font-medium">of {formatEGP(goal.targetAmountPiastres)}</span></span>
          </div>
          <ProgressBar value={amount > 0 ? newPct : goal.percentage} tone="brand" />
        </div>
        <p className="text-[13px] text-ink-3 px-0.5">This tracks progress only — it doesn’t move money between accounts.</p>
        {error && <Banner tone="error">{error}</Banner>}
      </form>
    </Sheet>
  );
}
