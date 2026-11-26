import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { deleteTransaction } from '../services/transactions';
import { TransactionList } from '../components/transactions/TransactionList';
import { AddTransactionForm } from '../components/transactions/AddTransactionForm';
import { TransferForm } from '../components/transactions/TransferForm';
import type { Transaction, TransactionType, Page } from '../types';

interface Props {
  onNavigate?: (page: Page) => void;
  /** Opened from the "uncategorized" notification. */
  initialFilter?: 'uncategorized';
}

export function Transactions({ onNavigate, initialFilter }: Props) {
  const [onlyUncategorized, setOnlyUncategorized] = useState(initialFilter === 'uncategorized');
  const [showForm, setShowForm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [filterAccount, setFilterAccount] = useState<number | 'all'>('all');

  const accounts = useLiveQuery(() => db.accounts.toArray());

  const transactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray(),
    []
  );

  const uncategorizedIds = useLiveQuery(
    async () => (await db.categories.where('name').equals('Uncategorized').toArray()).map(c => c.id!),
    []
  );
  const uncategorizedCount = transactions?.filter(t => t.categoryId != null && uncategorizedIds?.includes(t.categoryId)).length ?? 0;

  const filtered = transactions?.filter(t => {
    if (onlyUncategorized && !(t.categoryId != null && uncategorizedIds?.includes(t.categoryId))) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterAccount !== 'all' &&
      t.accountId !== filterAccount &&
      t.toAccountId !== filterAccount
    ) return false;
    return true;
  }) ?? [];

  const handleEdit = useCallback((txn: Transaction) => {
    setEditingTxn(txn);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (confirm('Delete this transaction?')) {
      await deleteTransaction(id);
    }
  }, []);

  const handleSaved = useCallback(() => {
    setEditingTxn(null);
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <div className="flex gap-2">
          {onNavigate && (
            <button
              onClick={() => onNavigate('import')}
              className="text-xs bg-primary/15 text-primary hover:bg-primary/25 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
            >
              📥 Import SMS
            </button>
          )}
          <button
            onClick={() => setShowTransfer(true)}
            className="text-xs bg-warning/15 text-warning px-2.5 py-1.5 rounded-lg font-medium"
          >
            🔄 Transfer
          </button>
          <button
            onClick={() => { setEditingTxn(null); setShowForm(true); }}
            className="text-xs bg-primary text-white px-2.5 py-1.5 rounded-lg font-medium"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'income', 'expense', 'transfer'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filterType === t
                ? 'bg-primary text-white'
                : 'bg-surface text-text-muted'
            }`}
          >
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Uncategorized (auto-imported SMS waiting for a category) */}
      {(uncategorizedCount > 0 || onlyUncategorized) && (
        <button
          onClick={() => setOnlyUncategorized(v => !v)}
          className={`w-full text-left text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
            onlyUncategorized ? 'bg-warning/20 text-warning' : 'bg-warning/10 text-warning/90'
          }`}
        >
          ❓ {uncategorizedCount} {uncategorizedCount === 1 ? 'transaction needs' : 'transactions need'} a category
          {onlyUncategorized ? ' · tap a transaction → Edit · show all' : ' · show them'}
        </button>
      )}

      {/* Account filter */}
      {accounts && accounts.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterAccount('all')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              filterAccount === 'all'
                ? 'bg-surface-light text-text'
                : 'bg-surface text-text-muted'
            }`}
          >
            All Accounts
          </button>
          {accounts.map(a => (
            <button
              key={a.id}
              onClick={() => setFilterAccount(a.id!)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filterAccount === a.id
                  ? 'bg-surface-light text-text'
                  : 'bg-surface text-text-muted'
              }`}
            >
              {a.icon} {a.name}
            </button>
          ))}
        </div>
      )}

      {/* Transaction List */}
      <TransactionList
        transactions={filtered}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Forms */}
      {showForm && (
        <AddTransactionForm
          onClose={() => { setShowForm(false); setEditingTxn(null); }}
          onSaved={handleSaved}
          editingTransaction={editingTxn ? {
            id: editingTxn.id!,
            amount: editingTxn.amount,
            type: editingTxn.type,
            accountId: editingTxn.accountId,
            categoryId: editingTxn.categoryId,
            merchant: editingTxn.merchant,
            note: editingTxn.note,
            date: editingTxn.date,
          } : undefined}
        />
      )}

      {showTransfer && (
        <TransferForm
          onClose={() => setShowTransfer(false)}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
