import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { Transaction, Category, Account } from '../../types';

export function useLookups() {
  const categories = useLiveQuery(() => db.categories.toArray());
  const accounts = useLiveQuery(() => db.accounts.toArray());
  return useMemo(() => {
    const categoryMap = new Map<number, Category>();
    categories?.forEach((c) => categoryMap.set(c.id!, c));
    const accountMap = new Map<number, Account>();
    accounts?.forEach((a) => accountMap.set(a.id!, a));
    return { categoryMap, accountMap };
  }, [categories, accounts]);
}

export function describeTransaction(txn: Transaction, categoryMap: Map<number, Category>, accountMap: Map<number, Account>) {
  const category = txn.categoryId ? categoryMap.get(txn.categoryId) : undefined;
  const account = accountMap.get(txn.accountId);
  const toAccount = txn.toAccountId ? accountMap.get(txn.toAccountId) : undefined;
  const isTransfer = txn.type === 'transfer';
  const title = isTransfer
    ? `${account?.name ?? 'Account'} → ${toAccount?.name ?? 'Account'}`
    : txn.merchant || category?.name || 'Transaction';
  const subtitle = isTransfer ? 'Transfer' : [txn.merchant ? category?.name : null, account?.name].filter(Boolean).join(' · ');
  const uncategorized = !isTransfer && (!category || /uncategor/i.test(category.name));
  return { category, account, toAccount, isTransfer, title, subtitle, uncategorized };
}

