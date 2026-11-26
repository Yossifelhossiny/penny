import { useMemo, useState } from 'react';
import { MessageSquareText, Pencil, ReceiptText, Trash2 } from 'lucide-react';
import { formatTime } from '../../utils/format';
import type { Transaction, Category, Account } from '../../types';
import { describeTransaction, useLookups } from './transactionHelpers';
import { Amount, Badge, Button, Card, CategoryIcon, ConfirmSheet, EmptyState, Sheet, cx } from '../ui';

interface Props {
  transactions: Transaction[];
  onEdit: (txn: Transaction) => void;
  /** Called after the user confirmed in the app. Delete without asking again. */
  onDelete: (id: number) => void | Promise<void>;
  /** Show a flat list without day headings (used for short previews). */
  compact?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
}

function dayLabel(d: Date, today = new Date()): string {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
}

export function TransactionList({ transactions, onEdit, onDelete, compact, emptyTitle, emptyMessage, emptyAction }: Props) {
  const { categoryMap, accountMap } = useLookups();
  const [selected, setSelected] = useState<Transaction | null>(null);

  const groups = useMemo(() => {
    if (compact) return [{ label: '', items: transactions }];
    const out: { label: string; items: Transaction[] }[] = [];
    for (const t of transactions) {
      const label = dayLabel(t.date);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(t);
      else out.push({ label, items: [t] });
    }
    return out;
  }, [transactions, compact]);

  if (transactions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ReceiptText />}
          title={emptyTitle ?? 'No transactions yet'}
          message={emptyMessage ?? 'Add one with the + button, or import your bank SMS.'}
          action={emptyAction}
        />
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.label || 'all'} className="space-y-2">
            {g.label && <h3 className="text-[13px] font-semibold text-ink-3 px-1">{g.label}</h3>}
            <Card padded={false} className="py-1.5">
              {g.items.map((txn) => (
                <TransactionRow key={txn.id} txn={txn} categoryMap={categoryMap} accountMap={accountMap} onClick={() => setSelected(txn)} showDate={compact} />
              ))}
            </Card>
          </div>
        ))}
      </div>

      {selected && (
        <TransactionDetailSheet
          txn={selected}
          categoryMap={categoryMap}
          accountMap={accountMap}
          onClose={() => setSelected(null)}
          onEdit={() => {
            const t = selected;
            setSelected(null);
            onEdit(t);
          }}
          onDelete={async () => {
            await onDelete(selected.id!);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}

function TransactionRow({
  txn,
  categoryMap,
  accountMap,
  onClick,
  showDate,
}: {
  txn: Transaction;
  categoryMap: Map<number, Category>;
  accountMap: Map<number, Account>;
  onClick: () => void;
  showDate?: boolean;
}) {
  const d = describeTransaction(txn, categoryMap, accountMap);
  const tone = txn.type === 'income' ? 'income' : txn.type === 'transfer' ? 'transfer' : 'expense';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-4 py-2.5 text-left hover:bg-brand-50/60 active:bg-brand-50 transition-colors"
    >
      <CategoryIcon category={d.category} transfer={d.isTransfer} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-ink truncate" dir="auto">{d.title}</p>
        <p className="text-[13px] text-ink-3 truncate mt-0.5">
          {d.uncategorized ? <span className="text-caution font-medium">Needs a category</span> : d.subtitle}
          {showDate && <span> · {txn.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <Amount piastres={txn.amount} tone={tone} signed={txn.type !== 'transfer'} />
        <p className="text-[12px] text-ink-3 mt-0.5 num">{formatTime(txn.date)}</p>
      </div>
    </button>
  );
}

export function TransactionDetailSheet({
  txn,
  categoryMap,
  accountMap,
  onClose,
  onEdit,
  onDelete,
}: {
  txn: Transaction;
  categoryMap: Map<number, Category>;
  accountMap: Map<number, Account>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}) {
  const d = describeTransaction(txn, categoryMap, accountMap);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const typeLabel = { income: 'Income', expense: 'Expense', transfer: 'Transfer' }[txn.type];

  if (confirming) {
    return (
      <ConfirmSheet
        title="Delete transaction?"
        message="This removes it from your history and updates the account balance. It can’t be undone."
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          setBusy(true);
          await onDelete();
        }}
      />
    );
  }

  const rows: Array<[string, React.ReactNode]> = [
    ['Type', typeLabel],
    d.isTransfer ? ['From', d.account?.name ?? '—'] : ['Account', d.account?.name ?? '—'],
    ...(d.isTransfer ? ([['To', d.toAccount?.name ?? '—']] as Array<[string, React.ReactNode]>) : []),
    ...(!d.isTransfer
      ? ([['Category', d.uncategorized ? <Badge tone="warning">Uncategorized</Badge> : d.category?.name]] as Array<[string, React.ReactNode]>)
      : []),
    ['Date', txn.date.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })],
    ...(txn.merchant ? ([[txn.type === 'income' ? 'From' : 'Paid to', <span dir="auto">{txn.merchant}</span>]] as Array<[string, React.ReactNode]>) : []),
    ...(txn.note ? ([['Note', <span dir="auto">{txn.note}</span>]] as Array<[string, React.ReactNode]>) : []),
    ...(txn.referenceId ? ([['Reference', <span className="num">{txn.referenceId}</span>]] as Array<[string, React.ReactNode]>) : []),
  ];

  return (
    <Sheet
      title="Transaction"
      onClose={onClose}
      footer={
        <div className={cx('grid gap-2.5', d.isTransfer ? 'grid-cols-1' : 'grid-cols-2')}>
          <Button variant="danger" size="lg" icon={<Trash2 className="size-4" />} onClick={() => setConfirming(true)}>
            Delete
          </Button>
          {!d.isTransfer && (
            <Button variant="secondary" size="lg" icon={<Pencil className="size-4" />} onClick={onEdit}>
              {d.uncategorized ? 'Set category' : 'Edit'}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col items-center text-center pt-1 pb-5">
        <CategoryIcon category={d.category} transfer={d.isTransfer} size="lg" />
        <p className="text-[15px] font-semibold text-ink-2 mt-3 max-w-full truncate" dir="auto">{d.title}</p>
        <Amount
          piastres={txn.amount}
          tone={txn.type === 'income' ? 'income' : 'neutral'}
          signed={txn.type !== 'transfer'}
          size="xl"
          className="mt-1"
        />
      </div>

      <dl className="rounded-2xl bg-well/70 px-4 py-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-3 [&+&]:border-t [&+&]:border-hairline">
            <dt className="text-sm text-ink-3 shrink-0">{k}</dt>
            <dd className="text-sm font-semibold text-ink text-right min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>

      {txn.originalSms && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 px-1 mb-2">
            <MessageSquareText className="size-4" /> Original SMS
          </p>
          <p dir="auto" className="text-sm text-ink-2 leading-relaxed bg-brand-50 rounded-2xl px-4 py-3 whitespace-pre-wrap break-words">
            {txn.originalSms}
          </p>
        </div>
      )}
    </Sheet>
  );
}
