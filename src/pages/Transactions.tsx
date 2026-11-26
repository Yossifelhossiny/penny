import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MessageSquareText, Search, X } from 'lucide-react';
import { db } from '../db';
import { deleteTransaction } from '../services/transactions';
import { useMonthSelection } from '../hooks/useMonthSelection';
import { asDate, isInMonth, monthLabel } from '../utils/months';
import { TransactionList } from '../components/transactions/TransactionList';
import { useLookups } from '../components/transactions/transactionHelpers';
import { AddTransactionForm } from '../components/transactions/AddTransactionForm';
import { Amount, Button, ChipGroup, MonthSwitcher, PageHeader, Select, cx } from '../components/ui';
import type { Transaction, Page } from '../types';

interface Props {
  onNavigate?: (page: Page) => void;
  /** Opened from the "uncategorized" notification. */
  initialFilter?: 'uncategorized';
}

type TypeFilter = 'all' | 'expense' | 'income' | 'transfer' | 'uncategorized';

export function Transactions({ onNavigate, initialFilter }: Props) {
  const sel = useMonthSelection();
  const [allTime, setAllTime] = useState(initialFilter === 'uncategorized');
  const [filter, setFilter] = useState<TypeFilter>(initialFilter === 'uncategorized' ? 'uncategorized' : 'all');
  const [accountFilter, setAccountFilter] = useState<number>(0);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accounts = useLiveQuery(() => db.accounts.toArray());
  const transactions = useLiveQuery(async () => {
    const rows = await db.transactions.orderBy('date').reverse().toArray();
    // Normalise any legacy string dates so filtering and grouping stay correct.
    return rows.map((t) => (t.date instanceof Date ? t : { ...t, date: asDate(t.date) ?? new Date(0) }));
  }, []);
  const { categoryMap } = useLookups();

  const isUncategorized = (t: Transaction) => {
    if (t.type === 'transfer') return false;
    const c = t.categoryId != null ? categoryMap.get(t.categoryId) : undefined;
    return !c || /uncategor/i.test(c.name);
  };

  const inPeriod = useMemo(
    () => (transactions ?? []).filter((t) => allTime || isInMonth(t.date, sel.year, sel.month)),
    [transactions, allTime, sel.year, sel.month]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inPeriod.filter((t) => {
      if (filter === 'uncategorized' ? !isUncategorized(t) : filter !== 'all' && t.type !== filter) return false;
      if (accountFilter && t.accountId !== accountFilter && t.toAccountId !== accountFilter) return false;
      if (q) {
        const cat = t.categoryId != null ? categoryMap.get(t.categoryId)?.name : '';
        const hay = [t.merchant, t.note, cat, t.referenceId, t.originalSms, (t.amount / 100).toFixed(2)].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPeriod, filter, accountFilter, query, categoryMap]);

  const sums = useMemo(() => {
    let inc = 0;
    let out = 0;
    for (const t of filtered) {
      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') out += t.amount;
    }
    return { inc, out };
  }, [filtered]);

  const uncategorizedCount = useMemo(() => inPeriod.filter(isUncategorized).length, [inPeriod, categoryMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const periodLabel = allTime ? 'all time' : monthLabel(sel.year, sel.month);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity"
        actions={
          onNavigate && (
            <Button variant="secondary" size="sm" icon={<MessageSquareText className="size-4" />} onClick={() => onNavigate('import')}>
              Import SMS
            </Button>
          )
        }
      />

      {/* Period */}
      <div className="flex items-center justify-between gap-2">
        {allTime ? (
          <p className="text-[15px] font-semibold text-ink px-1">All time</p>
        ) : (
          <MonthSwitcher sel={sel} />
        )}
        <button
          type="button"
          onClick={() => setAllTime((v) => !v)}
          className={cx('h-8 px-3 rounded-full text-[13px] font-semibold transition-colors', allTime ? 'bg-brand-100 text-brand-700' : 'text-ink-3 hover:bg-well')}
        >
          {allTime ? 'By month' : 'All time'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="size-[18px] text-ink-3 absolute left-4 top-1/2 -translate-y-1/2" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchant, note, amount"
          aria-label="Search transactions"
          className="w-full h-12 rounded-2xl bg-surface shadow-card pl-11 pr-10 text-[15px] placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-brand-400/60"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 size-7 rounded-full flex items-center justify-center text-ink-3 hover:bg-well">
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <ChipGroup<TypeFilter>
        label="Filter by type"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'expense', label: 'Expenses' },
          { value: 'income', label: 'Income' },
          { value: 'transfer', label: 'Transfers' },
          ...(uncategorizedCount > 0 || filter === 'uncategorized'
            ? [{ value: 'uncategorized' as const, label: <>Needs category <span className="num opacity-70">{uncategorizedCount}</span></> }]
            : []),
        ]}
      />

      {accounts && accounts.length > 1 && (
        <Select value={accountFilter} onChange={(e) => setAccountFilter(Number(e.target.value))} aria-label="Filter by account" className="bg-surface shadow-card h-11 text-sm">
          <option value={0}>All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      )}

      {/* Summary */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-1 text-[13px]">
          <span className="text-ink-3 num">{filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'}</span>
          <span className="flex items-center gap-3">
            {sums.inc > 0 && <Amount piastres={sums.inc} tone="income" signed size="sm" />}
            {sums.out > 0 && <Amount piastres={sums.out} tone="expense" signed size="sm" />}
          </span>
        </div>
      )}

      {filter === 'uncategorized' && filtered.length > 0 && (
        <p className="text-[13px] text-ink-3 px-1 -mt-2">Tap a transaction, then “Set category”.</p>
      )}

      <TransactionList
        transactions={filtered}
        onEdit={setEditing}
        onDelete={(id) => deleteTransaction(id)}
        emptyTitle={query || filter !== 'all' || accountFilter ? 'Nothing matches' : `No transactions in ${periodLabel}`}
        emptyMessage={
          query || filter !== 'all' || accountFilter
            ? 'Try a different search or filter.'
            : allTime
              ? 'Add one with the + button, or import your bank SMS.'
              : 'Nothing recorded this month yet.'
        }
      />

      {editing && (
        <AddTransactionForm
          editingTransaction={{ ...editing, id: editing.id! }}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
    </div>
  );
}
