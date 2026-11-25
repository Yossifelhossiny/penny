import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatEGP } from '../utils/format';
import { getAllBalances } from '../services/transactions';
import { AccountDetailView } from '../components/accounts/AccountDetailView';
import { AccountFormModal } from '../components/accounts/AccountFormModal';

export function Accounts() {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [balances, setBalances] = useState<Map<number, number>>(new Map());

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const allTransactions = useLiveQuery(() => db.transactions.toArray());

  useEffect(() => {
    if (allTransactions === undefined) return;
    getAllBalances().then(setBalances);
  }, [allTransactions]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // If currently viewing a specific account detail
  if (selectedAccount) {
    return (
      <AccountDetailView
        account={selectedAccount}
        onBack={() => setSelectedAccountId(null)}
        onAccountUpdated={() => {
          getAllBalances().then(setBalances);
        }}
        onAccountDeleted={() => {
          setSelectedAccountId(null);
          getAllBalances().then(setBalances);
        }}
      />
    );
  }

  const totalBalance = accounts.reduce((sum, a) => {
    return sum + (balances.get(a.id!) ?? a.openingBalance);
  }, 0);

  return (
    <div className="p-4 space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>💳</span>
            <span>Accounts</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Manage bank accounts, mobile wallets, and cash
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="text-xs bg-primary text-white font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-primary-dark transition-colors cursor-pointer"
        >
          <span>+</span>
          <span>Add Account</span>
        </button>
      </div>

      {/* Total Balance Card */}
      <div className="bg-surface rounded-2xl p-5 text-center border border-white/5 space-y-1">
        <p className="text-xs text-text-muted">Total Net Balance</p>
        <p className="text-3xl font-bold text-primary">{formatEGP(totalBalance)}</p>
        <p className="text-[11px] text-text-muted pt-1">
          Across {accounts.length} account{accounts.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Account Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Your Accounts
          </h3>
          <span className="text-[11px] text-text-muted">
            Tap an account to view history & reconcile
          </span>
        </div>

        {accounts.length === 0 ? (
          <div className="bg-surface rounded-xl p-8 text-center border border-white/5 space-y-2">
            <p className="text-3xl">🏦</p>
            <p className="text-sm font-semibold">No accounts yet</p>
            <p className="text-xs text-text-muted">
              Add your bank account, Vodafone Cash, or Cash Wallet to get started.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-2 text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-medium inline-block cursor-pointer"
            >
              + Create First Account
            </button>
          </div>
        ) : (
          accounts.map((account) => {
            const balance = balances.get(account.id!) ?? account.openingBalance;
            return (
              <div
                key={account.id}
                onClick={() => setSelectedAccountId(account.id!)}
                className="bg-surface hover:bg-surface-light/60 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all cursor-pointer group space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl shrink-0 group-hover:scale-105 transition-transform">
                      {account.icon}
                    </span>
                    <div>
                      <p className="font-semibold text-sm text-text flex items-center gap-1.5">
                        <span>{account.name}</span>
                        <span className="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          →
                        </span>
                      </p>
                      <p className="text-[11px] text-text-muted capitalize">
                        {account.type.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-text-muted">Balance</p>
                    <p className="text-xl font-bold" style={{ color: account.color }}>
                      {formatEGP(balance)}
                    </p>
                  </div>
                </div>

                {/* Footer info row */}
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-text-muted">
                  <span>
                    {account.openingBalance > 0
                      ? `Opening: ${formatEGP(account.openingBalance)}`
                      : 'No opening balance'}
                  </span>
                  <span className="text-primary font-medium group-hover:underline">
                    View History & Ledger →
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Account Modal */}
      {showCreateModal && (
        <AccountFormModal
          onClose={() => setShowCreateModal(false)}
          onSaved={(newId) => {
            getAllBalances().then(setBalances);
            setShowCreateModal(false);
            if (newId) setSelectedAccountId(newId);
          }}
        />
      )}
    </div>
  );
}
