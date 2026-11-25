import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { Account, Transaction, TransactionType, Category } from '../../types';
import { getAccountStats, type AccountStats } from '../../services/accounts';
import { deleteTransaction } from '../../services/transactions';
import { formatEGP, formatDate, formatTime } from '../../utils/format';
import { AccountFormModal } from './AccountFormModal';
import { ReconcileModal } from './ReconcileModal';
import { AddTransactionForm } from '../transactions/AddTransactionForm';
import { TransferForm } from '../transactions/TransferForm';

interface Props {
  account: Account;
  onBack: () => void;
  onAccountUpdated: () => void;
  onAccountDeleted: () => void;
}

export function AccountDetailView({
  account,
  onBack,
  onAccountUpdated,
  onAccountDeleted,
}: Props) {
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);

  // Live queries
  const allAccounts = useLiveQuery(() => db.accounts.toArray());
  const allCategories = useLiveQuery(() => db.categories.toArray());

  const accountTransactions = useLiveQuery(
    () =>
      db.transactions
        .orderBy('date')
        .reverse()
        .filter((t) => t.accountId === account.id || t.toAccountId === account.id)
        .toArray(),
    [account.id]
  );

  // Recompute stats whenever transactions change
  useEffect(() => {
    if (!account.id || accountTransactions === undefined) return;
    getAccountStats(account.id).then(setStats);
  }, [account.id, accountTransactions]);

  const txns = accountTransactions ?? [];

  const accountMap = new Map<number, Account>();
  allAccounts?.forEach((a) => accountMap.set(a.id!, a));

  const categoryMap = new Map<number, Category>();
  allCategories?.forEach((c) => categoryMap.set(c.id!, c));

  const filteredTxns = txns.filter((t) => {
    if (filterType === 'all') return true;
    return t.type === filterType;
  });

  const handleDeleteTxn = useCallback(async (id: number) => {
    if (confirm('Delete this transaction?')) {
      await deleteTransaction(id);
    }
  }, []);

  const totalIn = (stats?.totalIncome ?? 0) + (stats?.totalTransfersIn ?? 0);
  const totalOut = (stats?.totalExpenses ?? 0) + (stats?.totalTransfersOut ?? 0);
  const netFlow = totalIn - totalOut;

  return (
    <div className="p-4 space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-text-muted hover:text-text px-2.5 py-1.5 rounded-lg bg-surface border border-white/5 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>←</span>
          <span>All Accounts</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="text-xs bg-surface hover:bg-surface-light border border-white/5 text-text-muted hover:text-text px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer"
          >
            ⚙️ Edit Account
          </button>
        </div>
      </div>

      {/* Account Hero Balance Card */}
      <div className="bg-surface rounded-2xl p-5 border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{account.icon}</span>
            <div>
              <h2 className="text-base font-bold text-text">{account.name}</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-light text-text-muted capitalize">
                {account.type.replace('_', ' ')}
              </span>
            </div>
          </div>
          {account.openingBalance > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-text-muted uppercase">Opening</p>
              <p className="text-xs text-text-muted font-medium">
                {formatEGP(account.openingBalance)}
              </p>
            </div>
          )}
        </div>

        {/* Current Balance */}
        <div className="pt-2 border-t border-white/5 flex items-baseline justify-between">
          <div>
            <p className="text-xs text-text-muted mb-0.5">Current Balance</p>
            <p className="text-3xl font-bold" style={{ color: account.color }}>
              {formatEGP(stats?.balance ?? account.openingBalance)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowReconcileModal(true)}
            className="text-xs bg-primary/15 text-primary hover:bg-primary/25 font-medium px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
          >
            ⚖️ Reconcile
          </button>
        </div>

        {/* Flow Summary Chips */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center">
          <div className="bg-surface-light/50 rounded-xl p-2.5">
            <p className="text-[10px] text-text-muted uppercase">Total In</p>
            <p className="text-xs font-bold text-success mt-0.5">+{formatEGP(totalIn)}</p>
          </div>
          <div className="bg-surface-light/50 rounded-xl p-2.5">
            <p className="text-[10px] text-text-muted uppercase">Total Out</p>
            <p className="text-xs font-bold text-danger mt-0.5">-{formatEGP(totalOut)}</p>
          </div>
          <div className="bg-surface-light/50 rounded-xl p-2.5">
            <p className="text-[10px] text-text-muted uppercase">Net Flow</p>
            <p
              className={`text-xs font-bold mt-0.5 ${
                netFlow >= 0 ? 'text-primary' : 'text-danger'
              }`}
            >
              {netFlow >= 0 ? '+' : ''}{formatEGP(netFlow)}
            </p>
          </div>
        </div>
      </div>

      {/* Account Quick Actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => {
            setEditingTxn(null);
            setShowAddTxn(true);
          }}
          className="bg-primary text-white font-medium py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-primary-dark transition-colors cursor-pointer"
        >
          <span>+</span>
          <span>Add Transaction</span>
        </button>
        <button
          type="button"
          onClick={() => setShowTransfer(true)}
          className="bg-warning/15 text-warning font-medium py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-warning/25 transition-colors cursor-pointer"
        >
          <span>🔄</span>
          <span>Transfer Money</span>
        </button>
      </div>

      {/* Account Ledger / Transaction History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">
            Account History ({txns.length})
          </h3>
          <span className="text-xs text-text-muted">
            {filteredTxns.length} visible
          </span>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(['all', 'income', 'expense', 'transfer'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                filterType === t
                  ? 'bg-primary text-white'
                  : 'bg-surface text-text-muted hover:text-text'
              }`}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* List of Account Transactions */}
        {filteredTxns.length === 0 ? (
          <div className="bg-surface rounded-xl p-8 text-center border border-white/5">
            <p className="text-3xl mb-2">📜</p>
            <p className="text-text-muted text-xs">
              No transactions logged for this account yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTxns.map((txn) => {
              const isTransfer = txn.type === 'transfer';
              const isOutgoingTransfer = isTransfer && txn.accountId === account.id;
              const isIncomingTransfer = isTransfer && txn.toAccountId === account.id;

              const isMoneyIn = txn.type === 'income' || isIncomingTransfer;
              const isMoneyOut = txn.type === 'expense' || isOutgoingTransfer;

              const amountColor = isMoneyIn
                ? 'text-success'
                : isMoneyOut
                ? 'text-danger'
                : 'text-warning';
              const amountPrefix = isMoneyIn ? '+' : '-';

              const category = txn.categoryId ? categoryMap.get(txn.categoryId) : null;
              const otherAccount = isOutgoingTransfer
                ? accountMap.get(txn.toAccountId!)
                : isIncomingTransfer
                ? accountMap.get(txn.accountId)
                : null;

              const icon = isTransfer ? '🔄' : category?.icon ?? '📦';

              return (
                <div
                  key={txn.id}
                  className="bg-surface rounded-xl p-3 flex items-center gap-3 border border-white/5 group hover:border-white/10 transition-colors"
                >
                  <div className="text-2xl shrink-0">{icon}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-xs truncate">
                        {isTransfer
                          ? isOutgoingTransfer
                            ? `Transfer to ${otherAccount?.name ?? 'Account'}`
                            : `Transfer from ${otherAccount?.name ?? 'Account'}`
                          : category?.name ?? 'Transaction'}
                      </p>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium shrink-0 ${
                          isMoneyIn
                            ? 'bg-success/15 text-success'
                            : isTransfer
                            ? 'bg-warning/15 text-warning'
                            : 'bg-danger/15 text-danger'
                        }`}
                      >
                        {isTransfer
                          ? isOutgoingTransfer
                            ? 'Transfer Out'
                            : 'Transfer In'
                          : txn.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-text-muted mt-0.5">
                      {txn.merchant && <span className="truncate">{txn.merchant}</span>}
                      {txn.merchant && <span>·</span>}
                      <span>{formatDate(txn.date)}</span>
                      <span>{formatTime(txn.date)}</span>
                      {txn.originalSms && (
                        <span
                          className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.2 rounded font-mono font-medium cursor-help"
                          title={txn.originalSms}
                        >
                          SMS
                        </span>
                      )}
                    </div>

                    {txn.note && (
                      <p className="text-[11px] text-text-muted/70 mt-0.5 truncate">{txn.note}</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`font-semibold text-xs ${amountColor}`}>
                      {amountPrefix}{formatEGP(txn.amount)}
                    </p>
                    <div className="flex gap-2 mt-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {!isTransfer && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTxn(txn);
                            setShowAddTxn(true);
                          }}
                          className="text-[11px] text-text-muted hover:text-primary transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteTxn(txn.id!)}
                        className="text-[11px] text-text-muted hover:text-danger transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Account Modal */}
      {showEditModal && (
        <AccountFormModal
          account={account}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            onAccountUpdated();
            setShowEditModal(false);
          }}
          onDeleted={() => {
            onAccountDeleted();
            setShowEditModal(false);
          }}
        />
      )}

      {/* Reconcile Modal */}
      {showReconcileModal && (
        <ReconcileModal
          account={account}
          currentBalancePiastres={stats?.balance ?? account.openingBalance}
          onClose={() => setShowReconcileModal(false)}
          onReconciled={() => {
            if (account.id) getAccountStats(account.id).then(setStats);
            onAccountUpdated();
          }}
        />
      )}

      {/* Add / Edit Transaction Form */}
      {showAddTxn && (
        <AddTransactionForm
          defaultAccountId={account.id}
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
          onClose={() => {
            setShowAddTxn(false);
            setEditingTxn(null);
          }}
          onSaved={() => {
            if (account.id) getAccountStats(account.id).then(setStats);
            onAccountUpdated();
            setEditingTxn(null);
          }}
        />
      )}

      {/* Transfer Form */}
      {showTransfer && (
        <TransferForm
          defaultFromAccountId={account.id}
          onClose={() => setShowTransfer(false)}
          onSaved={() => {
            if (account.id) getAccountStats(account.id).then(setStats);
            onAccountUpdated();
          }}
        />
      )}
    </div>
  );
}
