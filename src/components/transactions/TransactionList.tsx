import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { formatEGP, formatDate, formatTime } from '../../utils/format';
import type { Transaction, Category, Account } from '../../types';

interface Props {
  transactions: Transaction[];
  onEdit: (txn: Transaction) => void;
  onDelete: (id: number) => void;
  compact?: boolean;
}

export function TransactionList({ transactions, onEdit, onDelete, compact }: Props) {
  const categories = useLiveQuery(() => db.categories.toArray());
  const accounts = useLiveQuery(() => db.accounts.toArray());

  const categoryMap = new Map<number, Category>();
  categories?.forEach(c => categoryMap.set(c.id!, c));

  const accountMap = new Map<number, Account>();
  accounts?.forEach(a => accountMap.set(a.id!, a));

  if (transactions.length === 0) {
    return (
      <div className="bg-surface rounded-xl p-8 text-center">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-text-muted text-sm">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((txn) => {
        const category = txn.categoryId ? categoryMap.get(txn.categoryId) : null;
        const account = accountMap.get(txn.accountId);
        const toAccount = txn.toAccountId ? accountMap.get(txn.toAccountId) : null;

        const isIncome = txn.type === 'income';
        const isTransfer = txn.type === 'transfer';
        const amountColor = isIncome ? 'text-success' : isTransfer ? 'text-warning' : 'text-danger';
        const amountPrefix = isIncome ? '+' : isTransfer ? '' : '-';
        const icon = isTransfer ? '🔄' : category?.icon ?? '📦';

        return (
          <div
            key={txn.id}
            className="bg-surface rounded-xl p-3 flex items-center gap-3 group"
          >
            {/* Icon */}
            <div className="text-2xl shrink-0">{icon}</div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">
                  {isTransfer
                    ? `${account?.name ?? '?'} → ${toAccount?.name ?? '?'}`
                    : category?.name ?? 'Unknown'
                  }
                </p>
                {/* Type badge */}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                  isIncome ? 'bg-success/15 text-success' :
                  isTransfer ? 'bg-warning/15 text-warning' :
                  'bg-danger/15 text-danger'
                }`}>
                  {txn.type}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                {txn.merchant && <span className="truncate">{txn.merchant}</span>}
                {txn.merchant && <span>·</span>}
                <span className="shrink-0">{formatDate(txn.date)}</span>
                {!compact && <span className="shrink-0">{formatTime(txn.date)}</span>}
                {txn.originalSms && (
                  <span
                    className="shrink-0 text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-mono font-medium cursor-help"
                    title={txn.originalSms}
                  >
                    SMS
                  </span>
                )}
              </div>
              {txn.note && !compact && (
                <p className="text-xs text-text-muted/70 mt-0.5 truncate">{txn.note}</p>
              )}
            </div>

            {/* Amount & Actions */}
            <div className="text-right shrink-0">
              <p className={`font-semibold text-sm ${amountColor}`}>
                {amountPrefix}{formatEGP(txn.amount)}
              </p>
              {!compact && (
                <div className="flex gap-2 mt-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isTransfer && (
                    <button
                      onClick={() => onEdit(txn)}
                      className="text-xs text-text-muted hover:text-primary transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(txn.id!)}
                    className="text-xs text-text-muted hover:text-danger transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
