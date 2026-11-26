import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, HandCoins, Plus, Users } from 'lucide-react';
import { db } from '../db';
import type { Debt, Page, Person } from '../types';
import { getPeopleSummaries, debtOutstanding, type PersonSummary } from '../services/people';
import { formatEGP } from '../utils/format';
import { PersonSheet } from '../components/people/PersonSheet';
import { DebtDetailSheet, DebtFormSheet } from '../components/people/DebtSheet';
import { Amount, Badge, Button, Card, EmptyState, IconButton, PageHeader, Section, Segmented, cx } from '../components/ui';

type Tab = 'people' | 'debts';

function initials(name: string) {
  const parts = name.replace(/\*/g, '').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

export function People({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [tab, setTab] = useState<Tab>('people');
  const [summaries, setSummaries] = useState<PersonSummary[]>([]);
  const [openPerson, setOpenPerson] = useState<Person | null>(null);
  const [openDebt, setOpenDebt] = useState<Debt | null>(null);
  const [addingDebt, setAddingDebt] = useState(false);
  const [showSettled, setShowSettled] = useState(false);

  const txns = useLiveQuery(() => db.transactions.where('personId').above(0).toArray());
  const debtsQ = useLiveQuery(() => db.debts.toArray());
  const debts = debtsQ ?? [];
  const people = useLiveQuery(() => db.people.toArray()) ?? [];
  const nameOf = (id: number) => people.find((p) => p.id === id)?.name ?? 'Someone';

  useEffect(() => {
    if (txns === undefined) return;
    getPeopleSummaries().then(setSummaries);
  }, [txns, debtsQ, people.length]);

  const open = debts.filter((d) => d.status === 'open' && debtOutstanding(d) > 0);
  const settled = debts.filter((d) => !(d.status === 'open' && debtOutstanding(d) > 0));
  const owedToYou = open.filter((d) => d.direction === 'lent').reduce((s, d) => s + debtOutstanding(d), 0);
  const youOwe = open.filter((d) => d.direction === 'borrowed').reduce((s, d) => s + debtOutstanding(d), 0);
  const today = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="People & debts"
        leading={
          <IconButton label="Back to accounts" onClick={() => onNavigate('accounts')} className="-ml-2.5 mt-[-2px]">
            <ArrowLeft className="size-5" />
          </IconButton>
        }
        actions={
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAddingDebt(true)}>
            Debt
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-grad-soft p-4">
          <p className="text-[12px] font-semibold text-brand-800/70">Owed to you</p>
          <Amount piastres={owedToYou} size="lg" hideFraction className="mt-1 !text-income" />
        </div>
        <div className="rounded-2xl bg-surface shadow-card p-4">
          <p className="text-[12px] font-semibold text-ink-3">You owe</p>
          <Amount piastres={youOwe} size="lg" hideFraction className="mt-1" />
        </div>
      </div>

      <Segmented
        label="Section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'people', label: `People${summaries.length ? ` · ${summaries.length}` : ''}` },
          { value: 'debts', label: `Debts${open.length ? ` · ${open.length}` : ''}` },
        ]}
      />

      {tab === 'people' ? (
        summaries.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Users />}
              title="No people yet"
              message="When an InstaPay or wallet SMS names who sent or received money, they appear here automatically."
            />
          </Card>
        ) : (
          <Card padded={false} className="py-1.5">
            {summaries.map((s) => (
              <button key={s.person.id} type="button" onClick={() => setOpenPerson(s.person)} className="w-full flex items-center gap-3.5 px-4 py-3 text-left hover:bg-brand-50/60 transition-colors">
                <span className="size-11 rounded-full bg-grad-soft text-brand-700 font-bold text-sm flex items-center justify-center shrink-0">{initials(s.person.name)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-ink truncate" dir="auto">{s.person.name}</span>
                  <span className="block text-[13px] text-ink-3 truncate">
                    {s.uncategorizedCount > 0 ? (
                      <span className="text-caution font-semibold">{s.uncategorizedCount} need a category</span>
                    ) : (
                      s.transactionCount === 0 ? 'No transfers' : `${s.transactionCount} ${s.transactionCount === 1 ? 'transfer' : 'transfers'}`
                    )}
                    {s.debtBalancePiastres !== 0 && ` · ${s.debtBalancePiastres > 0 ? 'owes you' : 'you owe'} ${formatEGP(Math.abs(s.debtBalancePiastres))}`}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  {s.receivedPiastres > 0 && <Amount piastres={s.receivedPiastres} tone="income" signed size="sm" hideFraction className="block" />}
                  {s.sentPiastres > 0 && <Amount piastres={s.sentPiastres} tone="expense" signed size="sm" hideFraction className="block" />}
                </span>
              </button>
            ))}
          </Card>
        )
      ) : (
        <div className="space-y-6">
          {open.length === 0 ? (
            <Card>
              <EmptyState
                icon={<HandCoins />}
                title="No open debts"
                message="Record money you lent or borrowed — who, how much and why — and Penny will remind you when it’s due."
                action={<Button onClick={() => setAddingDebt(true)}>Add a debt</Button>}
              />
            </Card>
          ) : (
            <Section title="Open">
              <Card padded={false} className="py-1.5">
                {open
                  .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
                  .map((d) => {
                    const overdue = !!d.dueDate && d.dueDate < today;
                    return (
                      <button key={d.id} type="button" onClick={() => setOpenDebt(d)} className="w-full flex items-center gap-3.5 px-4 py-3 text-left hover:bg-brand-50/60 transition-colors">
                        <span className={cx('size-10 rounded-[13px] flex items-center justify-center shrink-0 text-[11px] font-bold', d.direction === 'lent' ? 'bg-income-soft text-income' : 'bg-brand-50 text-brand-700')}>
                          {d.direction === 'lent' ? 'IN' : 'OUT'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-semibold text-ink truncate" dir="auto">
                            {d.direction === 'lent' ? `${nameOf(d.personId)} owes you` : `You owe ${nameOf(d.personId)}`}
                          </span>
                          <span className="block text-[13px] text-ink-3 truncate">
                            {overdue ? <span className="text-expense font-semibold">Overdue · </span> : d.dueDate ? `Due ${d.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ` : ''}
                            {d.reason || 'No reason added'}
                          </span>
                        </span>
                        <Amount piastres={debtOutstanding(d)} size="sm" tone={d.direction === 'lent' ? 'income' : 'neutral'} />
                      </button>
                    );
                  })}
              </Card>
            </Section>
          )}

          {settled.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowSettled((v) => !v)} className="text-[13px] font-semibold text-ink-3 px-1">
                {showSettled ? 'Hide' : 'Show'} settled ({settled.length})
              </button>
              {showSettled && (
                <Card padded={false} className="py-1.5 mt-3">
                  {settled.map((d) => (
                    <button key={d.id} type="button" onClick={() => setOpenDebt(d)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                      <span className="text-sm text-ink-2 truncate" dir="auto">{nameOf(d.personId)} · {d.reason || (d.direction === 'lent' ? 'Lent' : 'Borrowed')}</span>
                      <Badge tone="income">Paid {formatEGP(d.amountPiastres)}</Badge>
                    </button>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {openPerson && <PersonSheet person={openPerson} onClose={() => setOpenPerson(null)} />}
      {openDebt && <DebtDetailSheet debt={openDebt} personName={nameOf(openDebt.personId)} onClose={() => setOpenDebt(null)} />}
      {addingDebt && <DebtFormSheet onClose={() => setAddingDebt(false)} />}
    </div>
  );
}
