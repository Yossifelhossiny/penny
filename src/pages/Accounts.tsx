import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus, Wallet } from 'lucide-react';
import { db } from '../db';
import { getAllBalances } from '../services/transactions';
import { AccountDetailView } from '../components/accounts/AccountDetailView';
import { AccountFormModal } from '../components/accounts/AccountFormModal';
import { AccountIcon, Amount, Button, Card, EmptyState, PageHeader, Section } from '../components/ui';

const TYPE_LABEL: Record<string, string> = { bank: 'Bank', vodafone_cash: 'Mobile wallet', cash: 'Cash' };

export function Accounts() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [balances, setBalances] = useState<Map<number, number>>(new Map());

  const accounts = useLiveQuery(() => db.accounts.toArray());
  const allTxns = useLiveQuery(() => db.transactions.toArray());

  useEffect(() => {
    if (allTxns === undefined) return;
    getAllBalances().then(setBalances);
  }, [allTxns]);

  const list = accounts ?? [];
  const selected = list.find((a) => a.id === selectedId);
  const reload = () => getAllBalances().then(setBalances);

  if (selected) {
    return (
      <AccountDetailView
        account={selected}
        onBack={() => setSelectedId(null)}
        onAccountUpdated={reload}
        onAccountDeleted={() => {
          setSelectedId(null);
          reload();
        }}
      />
    );
  }

  const total = list.reduce((s, a) => s + (balances.get(a.id!) ?? a.openingBalance), 0);
  const share = (v: number) => (total > 0 ? Math.max(0, Math.round((v / total) * 100)) : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        actions={
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Add
          </Button>
        }
      />

      <Card className="bg-grad-soft shadow-none">
        <p className="text-[13px] font-semibold text-brand-800/70">Net balance</p>
        <Amount piastres={total} size="xl" className="mt-1 !text-brand-900" />
        {list.length > 1 && total > 0 && (
          <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-white/70 gap-0.5" aria-hidden>
            {list.map((a, i) => (
              <div
                key={a.id}
                className="h-full"
                style={{
                  width: `${share(balances.get(a.id!) ?? a.openingBalance)}%`,
                  background: ['#5034a8', '#7253d6', '#9678ed', '#c2b1f1'][i % 4],
                }}
              />
            ))}
          </div>
        )}
      </Card>

      <Section title="Your accounts">
        {list.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Wallet />}
              title="No accounts yet"
              message="Add your bank card, Vodafone Cash or cash wallet to start tracking."
              action={<Button onClick={() => setCreating(true)}>Add account</Button>}
            />
          </Card>
        ) : (
          <Card padded={false} className="py-1.5">
            {list.map((a) => {
              const bal = balances.get(a.id!) ?? a.openingBalance;
              return (
                <button key={a.id} type="button" onClick={() => setSelectedId(a.id!)} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-brand-50/60 transition-colors">
                  <AccountIcon type={a.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-ink truncate">{a.name}</p>
                    <p className="text-[13px] text-ink-3">{TYPE_LABEL[a.type] ?? 'Account'}{total > 0 && bal > 0 ? ` · ${share(bal)}%` : ''}</p>
                  </div>
                  <Amount piastres={bal} className={bal < 0 ? '!text-expense' : undefined} />
                  <ChevronRight className="size-4 text-ink-4 -mr-1" />
                </button>
              );
            })}
          </Card>
        )}
      </Section>

      {creating && (
        <AccountFormModal
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            reload();
            setCreating(false);
            if (id) setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}
