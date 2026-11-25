import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { addIncome, addExpense, editTransaction } from '../../services/transactions';
import { toPiastres } from '../../utils/format';
import type { TransactionType } from '../../types';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  editingTransaction?: {
    id: number;
    amount: number; // piastres
    type: TransactionType;
    accountId: number;
    categoryId?: number;
    merchant?: string;
    note?: string;
    date: Date;
  };
  defaultAccountId?: number;
}

export function AddTransactionForm({ onClose, onSaved, editingTransaction, defaultAccountId }: Props) {
  const isEditing = !!editingTransaction;
  const [type, setType] = useState<'income' | 'expense'>(
    editingTransaction?.type === 'income' ? 'income' : 'expense'
  );
  const [amountStr, setAmountStr] = useState(
    editingTransaction ? (editingTransaction.amount / 100).toString() : ''
  );
  const [accountId, setAccountId] = useState<number>(
    editingTransaction?.accountId ?? defaultAccountId ?? 0
  );
  const [categoryId, setCategoryId] = useState<number>(editingTransaction?.categoryId ?? 0);
  const [merchant, setMerchant] = useState(editingTransaction?.merchant ?? '');
  const [note, setNote] = useState(editingTransaction?.note ?? '');
  const [dateStr, setDateStr] = useState(
    editingTransaction
      ? editingTransaction.date.toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16)
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const accounts = useLiveQuery(() => db.accounts.toArray());
  const categories = useLiveQuery(() =>
    db.categories.where('type').equals(type).toArray()
  , [type]);

  // Set default account on first load
  if (accountId === 0 && accounts && accounts.length > 0 && !editingTransaction) {
    setAccountId(accounts[0].id!);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Enter a valid positive amount');
      }

      const piastres = toPiastres(amount);
      const date = new Date(dateStr);

      if (!accountId) throw new Error('Select an account');
      if (!categoryId) throw new Error('Select a category');

      if (isEditing) {
        await editTransaction(editingTransaction!.id, {
          amount: piastres,
          type,
          accountId,
          categoryId,
          merchant: merchant || undefined,
          note: note || undefined,
          date,
        });
      } else {
        const input = {
          amount: piastres,
          accountId,
          categoryId,
          merchant: merchant || undefined,
          note: note || undefined,
          date,
        };

        if (type === 'income') {
          await addIncome(input);
        } else {
          await addExpense(input);
        }
      }

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
            <h2 className="text-lg font-semibold">
              {isEditing ? 'Edit Transaction' : 'Add Transaction'}
            </h2>
            <button onClick={onClose} className="text-text-muted text-2xl leading-none p-1">×</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Type Toggle */}
          {!isEditing && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  type === 'expense'
                    ? 'bg-danger text-white'
                    : 'bg-surface-light text-text-muted'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  type === 'income'
                    ? 'bg-success text-white'
                    : 'bg-surface-light text-text-muted'
                }`}
              >
                Income
              </button>
            </div>
          )}

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

          {/* Account */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(Number(e.target.value))}
              className="w-full bg-surface-light rounded-xl px-4 py-3 text-sm
                text-text outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
              required
            >
              <option value={0} disabled>Select account</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {categories?.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id!)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl text-xs transition-colors ${
                    categoryId === cat.id
                      ? 'bg-primary/20 ring-2 ring-primary text-primary'
                      : 'bg-surface-light text-text-muted'
                  }`}
                >
                  <span className="text-lg">{cat.icon}</span>
                  <span className="truncate w-full text-center">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Merchant */}
          <div>
            <label className="text-xs text-text-muted block mb-1">
              {type === 'income' ? 'Source' : 'Merchant'} (optional)
            </label>
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder={type === 'income' ? 'e.g., Upwork' : 'e.g., Carrefour'}
              className="w-full bg-surface-light rounded-xl px-4 py-3 text-sm
                text-text placeholder:text-text-muted/50 outline-none focus:ring-2 focus:ring-primary/50"
            />
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
            {saving ? 'Saving...' : isEditing ? 'Update Transaction' : `Add ${type === 'income' ? 'Income' : 'Expense'}`}
          </button>
        </form>
      </div>
    </div>
  );
}
