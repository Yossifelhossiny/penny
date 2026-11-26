import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus } from 'lucide-react';
import { db } from '../../db';
import type { Debt, Person } from '../../types';
import { applyCategoryToMatching, learnCategory } from '../../services/categoryRules';
import { debtOutstanding, renamePerson } from '../../services/people';
import { formatEGP } from '../../utils/format';
import { Amount, Badge, Banner, Button, Field, IconButton, Select, Sheet, TextInput } from '../ui';
import { DebtDetailSheet, DebtFormSheet } from './DebtSheet';

/** One person: money in/out, their uncategorized transfers, and debts. */
export function PersonSheet({ person, onClose }: { person: Person; onClose: () => void }) {
  const txns = useLiveQuery(() => db.transactions.where('personId').equals(person.id!).reverse().sortBy('date'), [person.id]) ?? [];
  const debts = useLiveQuery(() => db.debts.where('personId').equals(person.id!).toArray(), [person.id]) ?? [];
  const categoriesQ = useLiveQuery(() => db.categories.toArray());
  const categories = useMemo(() => categoriesQ ?? [], [categoriesQ]);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(person.name);
  const [addingDebt, setAddingDebt] = useState(false);
  const [openDebt, setOpenDebt] = useState<Debt | null>(null);
  const [filing, setFiling] = useState<{ type: 'income' | 'expense'; categoryId: number } | null>(null);
  const [done, setDone] = useState('');

  const uncatIds = useMemo(() => new Set(categories.filter((c) => /^uncategorized$/i.test(c.name)).map((c) => c.id)), [categories]);
  const uncategorized = txns.filter((t) => t.categoryId != null && uncatIds.has(t.categoryId));
  const received = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const sent = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const uncatType: 'income' | 'expense' = uncategorized.some((t) => t.type === 'income') ? 'income' : 'expense';
  const catName = (id?: number) => categories.find((c) => c.id === id)?.name ?? '—';

  if (addingDebt) return <DebtFormSheet defaultPersonId={person.id} onClose={() => setAddingDebt(false)} />;
  if (openDebt) return <DebtDetailSheet debt={openDebt} personName={person.name} onClose={() => setOpenDebt(null)} />;

  async function fileAll() {
    if (!filing?.categoryId) return;
    await learnCategory(person.name, filing.type, filing.categoryId);
    const n = await applyCategoryToMatching(person.name, filing.type, filing.categoryId);
    setDone(`Moved ${n} ${n === 1 ? 'transaction' : 'transactions'} to ${catName(filing.categoryId)}. Future money from ${person.name} will go there too.`);
    setFiling(null);
  }

  return (
    <Sheet
      title={
        renaming ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await renamePerson(person.id!, name);
              setRenaming(false);
            }}
            className="flex gap-2"
          >
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-10" dir="auto" />
            <Button type="submit" size="sm">Save</Button>
          </form>
        ) : (
          <span className="flex items-center gap-1" dir="auto">
            {person.name}
            <IconButton label="Rename" size="sm" onClick={() => setRenaming(true)}>
              <Pencil className="size-3.5" />
            </IconButton>
          </span>
        )
      }
      description={person.phone}
      onClose={onClose}
      size="lg"
    >
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-income-soft/70 p-3.5">
          <p className="text-[12px] font-semibold text-income">Received from them</p>
          <Amount piastres={received} tone="income" size="lg" hideFraction className="mt-1" />
        </div>
        <div className="rounded-2xl bg-well/80 p-3.5">
          <p className="text-[12px] font-semibold text-ink-3">Sent to them</p>
          <Amount piastres={sent} size="lg" hideFraction className="mt-1" />
        </div>
      </div>

      {done && <Banner tone="success" className="mt-4">{done}</Banner>}

      {uncategorized.length > 0 && (
        <div className="mt-5 rounded-2xl bg-caution-soft p-4 space-y-3">
          <p className="text-sm font-semibold text-[#6f440f]">
            {uncategorized.length} {uncategorized.length === 1 ? 'transfer has' : 'transfers have'} no category yet
          </p>
          <p className="text-[13px] text-[#6f440f]/90">What was this money for? Penny will file these and every future transfer from {person.name} there.</p>
          <Field>
            <Select
              value={filing?.categoryId ?? 0}
              onChange={(e) => setFiling({ type: uncatType, categoryId: Number(e.target.value) })}
              className="bg-surface"
            >
              <option value={0}>Choose a category</option>
              {categories
                .filter((c) => c.type === uncatType && !/^uncategorized$/i.test(c.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </Select>
          </Field>
          <Button block disabled={!filing?.categoryId} onClick={fileAll}>File {uncategorized.length} here</Button>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[13px] font-semibold text-ink-3">Debts</p>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setAddingDebt(true)}>Add</Button>
        </div>
        {debts.length === 0 ? (
          <p className="text-sm text-ink-3 px-1">No debts with {person.name}.</p>
        ) : (
          <ul className="space-y-2">
            {debts.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setOpenDebt(d)} className="w-full flex items-center justify-between gap-3 rounded-2xl bg-well/70 px-4 py-3 text-left">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{d.direction === 'lent' ? 'They owe you' : 'You owe them'}</span>
                    <span className="block text-[12px] text-ink-3 truncate">{d.reason || d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  </span>
                  {d.status === 'settled' ? <Badge tone="income">Paid</Badge> : <Amount piastres={debtOutstanding(d)} size="sm" tone={d.direction === 'lent' ? 'income' : 'neutral'} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <p className="text-[13px] font-semibold text-ink-3 px-1 mb-2">Transfers · {txns.length}</p>
        <ul className="space-y-1">
          {txns.slice(0, 30).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-1 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-ink">{t.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className={`block text-[12px] ${t.categoryId != null && uncatIds.has(t.categoryId) ? 'text-caution font-semibold' : 'text-ink-3'}`}>{catName(t.categoryId)}</span>
              </span>
              <Amount piastres={t.amount} size="sm" tone={t.type === 'income' ? 'income' : 'expense'} signed />
            </li>
          ))}
        </ul>
        {txns.length > 30 && <p className="text-[12px] text-ink-3 px-1">Showing the latest 30 of {txns.length}. Total exchanged {formatEGP(received + sent)}.</p>}
      </div>
    </Sheet>
  );
}
