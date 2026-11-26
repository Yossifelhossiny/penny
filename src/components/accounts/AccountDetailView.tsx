import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowLeftRight, Pencil, Plus, Scale } from 'lucide-react';
import { db } from '../../db';
import type { Account, Transaction, TransactionType } from '../../types';
import { getAccountStats, type AccountStats } from '../../services/accounts';
import { deleteTransaction } from '../../services/transactions';
import { AccountFormModal } from './AccountFormModal';
import { ReconcileModal } from './ReconcileModal';
import { AddTransactionForm, type EntryMode } from '../transactions/AddTransactionForm';
import { TransactionList } from '../transactions/TransactionList';
import { AccountIcon, Amount, ChipGroup, IconButton, Section } from '../ui';

interface Props {
  account: Account;
  onBack: () => void;
  onAccountUpdated: () => void;
  onAccountDeleted: () => void;
}

const TYPE_LABEL: Record<string, string> = { bank: 'Bank account', vodafone_cash: 'Mobile wallet', cash: 'Cash' };

export function AccountDetailView({ account, onBack, onAccountUpdated, onAccountDeleted }: Props) {
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [showEdit, setShowEdit] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const [adding, setAdding] = useState<EntryMode | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const txns = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().filter((t) => t.accountId === account.id || t.toAccountId === account.id).toArray(),
    [account.id]
  );

  useEffect(() => {
    if (!account.id || txns === undefined) return;
    getAccountStats(account.id).then(setStats);
  }, [account.id, txns]);

  const refresh = () => {
    if (account.id) getAccountStats(account.id).then(setStats);
    onAccountUpdated();
  };

  const totalIn = (stats?.totalIncome ?? 0) + (stats?.totalTransfersIn ?? 0);
  const totalOut = (stats?.totalExpenses ?? 0) + (stats?.totalTransfersOut ?? 0);
  const shown = (txns ?? []).filter((t) => filter === 'all' || t.type === filter);

  const actions = [
    { label: 'Add', icon: <Plus />, onClick: () => setAdding('expense') },
    { label: 'Transfer', icon: <ArrowLeftRight />, onClick: () => setAdding('transfer') },
    { label: 'Match balance', icon: <Scale />, onClick: () => setShowReconcile(true) },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between pt-1">
        <IconButton label="All accounts" onClick={onBack} className="-ml-2">
          <ArrowLeft className="size-5" />
        </IconButton>
        <IconButton label="Edit account" onClick={() => setShowEdit(true)}>
          <Pencil className="size-[18px]" />
        </IconButton>
      </header>

      <section className="rounded-[28px] bg-grad-hero text-white p-6 shadow-raised">
        <div className="flex items-center gap-3">
          <AccountIcon type={account.type} inverse />
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{account.name}</h1>
            <p className="text-[13px] text-white/70">{TYPE_LABEL[account.type] ?? 'Account'}</p>
          </div>
        </div>
        <p className="text-[13px] font-semibold text-white/75 mt-6">Balance</p>
        <Amount piastres={stats?.balance ?? account.openingBalance} tone="inverse" size="display" className="mt-1.5" />
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.12] p-1.5">
          <div className="px-2.5 py-2">
            <p className="text-[11px] font-semibold text-white/75">Money in</p>
            <Amount piastres={totalIn} tone="inverse" size="sm" className="mt-0.5" />
          </div>
          <div className="px-2.5 py-2">
            <p className="text-[11px] font-semibold text-white/75">Money out</p>
            <Amount piastres={totalOut} tone="inverse" size="sm" className="mt-0.5" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2.5">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="flex flex-col items-center gap-2 rounded-2xl bg-surface shadow-card py-3.5 text-[13px] font-semibold text-ink-2 hover:text-ink transition-colors"
          >
            <span className="size-10 rounded-full bg-grad-soft text-brand-700 flex items-center justify-center [&_svg]:size-5">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      <Section title={`History · ${txns?.length ?? 0}`}>
        <ChipGroup
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfers' },
          ]}
        />
        <TransactionList
          transactions={shown}
          onEdit={setEditing}
          onDelete={async (id) => {
            await deleteTransaction(id);
            refresh();
          }}
          emptyTitle="Nothing here yet"
          emptyMessage="Transactions for this account will show up here."
        />
      </Section>

      {showEdit && (
        <AccountFormModal
          account={account}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            onAccountUpdated();
            setShowEdit(false);
          }}
          onDeleted={() => {
            onAccountDeleted();
            setShowEdit(false);
          }}
        />
      )}
      {showReconcile && (
        <ReconcileModal
          account={account}
          currentBalancePiastres={stats?.balance ?? account.openingBalance}
          onClose={() => setShowReconcile(false)}
          onReconciled={refresh}
        />
      )}
      {adding && <AddTransactionForm defaultAccountId={account.id} initialMode={adding} onClose={() => setAdding(null)} onSaved={refresh} />}
      {editing && (
        <AddTransactionForm
          editingTransaction={{ ...editing, id: editing.id! }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
