import { useState } from 'react';
import type { Account } from '../../types';
import { reconcileAccountBalance } from '../../services/accounts';
import { formatEGP, toPiastres } from '../../utils/format';
import { Amount, AmountInput, Banner, Button, Field, Sheet, TextInput } from '../ui';

interface Props {
  account: Account;
  currentBalancePiastres: number;
  onClose: () => void;
  onReconciled: () => void;
}

/**
 * Match Penny to the real balance shown in your bank app. If they differ, an
 * adjustment transaction is recorded so history stays honest.
 */
export function ReconcileModal({ account, currentBalancePiastres, onClose, onReconciled }: Props) {
  const [actualStr, setActualStr] = useState((currentBalancePiastres / 100).toFixed(2));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parsed = parseFloat(actualStr);
  const valid = !isNaN(parsed) && parsed >= 0;
  const actual = valid ? toPiastres(parsed) : currentBalancePiastres;
  const diff = actual - currentBalancePiastres;

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!valid) return setError('Enter the balance shown in your bank app');
    if (diff === 0) return onClose();
    setSaving(true);
    try {
      await reconcileAccountBalance(account.id!, actual, note.trim() || undefined);
      onReconciled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the balance');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Match real balance"
      description={account.name}
      onClose={onClose}
      footer={
        <Button type="submit" form="reconcile-form" size="lg" block loading={saving} disabled={!valid}>
          {diff === 0 ? 'Done' : 'Record adjustment'}
        </Button>
      }
    >
      <form id="reconcile-form" onSubmit={handleConfirm} className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-well/70 px-4 py-3">
          <span className="text-sm text-ink-3">In Penny now</span>
          <Amount piastres={currentBalancePiastres} />
        </div>

        <Field label="Balance in your bank app">
          <AmountInput value={actualStr} onChange={(e) => setActualStr(e.target.value)} aria-label="Actual balance" autoFocus />
        </Field>

        {valid && (
          <Banner tone={diff === 0 ? 'success' : 'info'} title={diff === 0 ? 'Everything matches' : `Difference ${diff > 0 ? '+' : '−'}${formatEGP(Math.abs(diff))}`}>
            {diff === 0
              ? 'Your recorded transactions add up to the real balance.'
              : diff > 0
                ? 'Penny will add an income adjustment for the difference.'
                : 'Penny will add an expense adjustment for the difference.'}
          </Banner>
        )}

        {diff !== 0 && (
          <Field label="Note">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Monthly statement check" />
          </Field>
        )}

        {error && <Banner tone="error">{error}</Banner>}
      </form>
    </Sheet>
  );
}
