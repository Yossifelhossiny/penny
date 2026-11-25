import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { addTransfer } from '../../services/transactions';
import { toPiastres, formatEGP } from '../../utils/format';
import { getAllBalances } from '../../services/transactions';
import { useEffect } from 'react';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  defaultFromAccountId?: number;
}

export function TransferForm({ onClose, onSaved, defaultFromAccountId }: Props) {
  const [amountStr, setAmountStr] = useState('');
  const [fromAccountId, setFromAccountId] = useState<number>(defaultFromAccountId ?? 0);
  const [toAccountId, setToAccountId] = useState<number>(0);
  const [note, setNote] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 16));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState<Map<number, number>>(new Map());

  const accounts = useLiveQuery(() => db.accounts.toArray());

  useEffect(() => {
    getAllBalances().then(setBalances);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Enter a valid positive amount');
      }

      if (!fromAccountId) throw new Error('Select source account');
      if (!toAccountId) throw new Error('Select destination account');
      if (fromAccountId === toAccountId) {
        throw new Error('Source and destination must be different');
      }

      await addTransfer({
        amount: toPiastres(amount),
        fromAccountId,
        toAccountId,
        note: note || undefined,
        date: new Date(dateStr),
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      <div className="bg-surface w-full max-w-lg rounded-t-2xl max-h-[90dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 bg-surface/95 backdrop-blur-md px-4 pt-4 pb-2 border-b border-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">🔄 Transfer</h2>
            <button onClick={onClose} className="text-text-muted text-2xl leading-none p-1">×</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Amount */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Amount (EGP)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              className="w-full bg-surface-light rounded-xl px-4 py-3 text-lg font-semibold
                text-text placeholder:text-text-muted/50 outline-none focus:ring-2 focus:ring-primary/50"
              required
              autoFocus
            />
          </div>

          {/* From Account */}
          <div>
            <label className="text-xs text-text-muted block mb-1">From</label>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(Number(e.target.value))}
              className="w-full bg-surface-light rounded-xl px-4 py-3 text-sm
                text-text outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
              required
            >
              <option value={0} disabled>Select source account</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name} ({formatEGP(balances.get(a.id!) ?? 0)})
                </option>
              ))}
            </select>
          </div>

          {/* Arrow */}
          <div className="text-center text-2xl text-text-muted">↓</div>

          {/* To Account */}
          <div>
            <label className="text-xs text-text-muted block mb-1">To</label>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(Number(e.target.value))}
              className="w-full bg-surface-light rounded-xl px-4 py-3 text-sm
                text-text outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
              required
            >
              <option value={0} disabled>Select destination account</option>
              {accounts?.filter(a => a.id !== fromAccountId).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name} ({formatEGP(balances.get(a.id!) ?? 0)})
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="w-full bg-surface-light rounded-xl px-4 py-3 text-sm
                text-text placeholder:text-text-muted/50 outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Date & Time</label>
            <input
              type="datetime-local"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full bg-surface-light rounded-xl px-4 py-3 text-sm
                text-text outline-none focus:ring-2 focus:ring-primary/50"
              required
            />
          </div>

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary text-white rounded-xl py-3.5 text-sm font-semibold
              active:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {saving ? 'Transferring...' : 'Transfer'}
          </button>
        </form>
      </div>
    </div>
  );
}
