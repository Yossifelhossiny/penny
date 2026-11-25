/**
 * Local Backup & Export Service
 *
 * Provides JSON database backup and restore, and CSV transaction exports.
 * 100% offline, local-first, zero server involvement.
 */

import { db } from '../db';
import type { Account, Transaction, Category, Budget, SavingsGoal } from '../types';

export interface PennyBackupData {
  appName: 'Penny';
  schemaVersion: number;
  exportDate: string;
  stats: {
    accountsCount: number;
    transactionsCount: number;
    categoriesCount: number;
    budgetsCount: number;
    goalsCount: number;
  };
  data: {
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    budgets: Budget[];
    goals: SavingsGoal[];
  };
}

/**
 * Generate full backup object from current IndexedDB.
 */
export async function generateBackupData(): Promise<PennyBackupData> {
  const [accounts, transactions, categories, budgets, goals] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
    db.budgets.toArray(),
    db.goals.toArray(),
  ]);

  return {
    appName: 'Penny',
    schemaVersion: 4,
    exportDate: new Date().toISOString(),
    stats: {
      accountsCount: accounts.length,
      transactionsCount: transactions.length,
      categoriesCount: categories.length,
      budgetsCount: budgets.length,
      goalsCount: goals.length,
    },
    data: {
      accounts,
      transactions,
      categories,
      budgets,
      goals,
    },
  };
}

/**
 * Trigger download of full JSON backup file in the browser.
 */
export async function downloadJsonBackup(): Promise<void> {
  const backup = await generateBackupData();
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `penny-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validate imported JSON data.
 */
export function validateBackupData(
  parsed: unknown
): { valid: boolean; error?: string; data?: PennyBackupData } {
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'Invalid JSON file: root must be an object' };
  }

  const obj = parsed as Record<string, unknown>;

  // Relaxed check: appName === 'Penny' or presence of data object
  const data = (obj.data || obj) as Record<string, unknown>;

  if (!Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
    return {
      valid: false,
      error: 'Invalid backup format: missing accounts or transactions data',
    };
  }

  const backupData: PennyBackupData = {
    appName: 'Penny',
    schemaVersion: (obj.schemaVersion as number) || 4,
    exportDate: (obj.exportDate as string) || new Date().toISOString(),
    stats: {
      accountsCount: (data.accounts as Account[]).length,
      transactionsCount: (data.transactions as Transaction[]).length,
      categoriesCount: Array.isArray(data.categories) ? data.categories.length : 0,
      budgetsCount: Array.isArray(data.budgets) ? data.budgets.length : 0,
      goalsCount: Array.isArray(data.goals) ? data.goals.length : 0,
    },
    data: {
      accounts: (data.accounts as Account[]).map(a => ({
        ...a,
        createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
      })),
      transactions: (data.transactions as Transaction[]).map(t => ({
        ...t,
        date: new Date(t.date),
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
      })),
      categories: Array.isArray(data.categories) ? (data.categories as Category[]) : [],
      budgets: Array.isArray(data.budgets) ? (data.budgets as Budget[]).map(b => ({
        ...b,
        createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
      })) : [],
      goals: Array.isArray(data.goals) ? (data.goals as SavingsGoal[]).map(g => ({
        ...g,
        targetDate: g.targetDate ? new Date(g.targetDate) : null,
        createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
      })) : [],
    },
  };

  return { valid: true, data: backupData };
}

/**
 * Restore database from backup data.
 */
export async function restoreBackupData(
  backup: PennyBackupData,
  mode: 'overwrite' | 'merge' = 'overwrite'
): Promise<{
  accountsRestored: number;
  transactionsRestored: number;
  categoriesRestored: number;
  budgetsRestored: number;
  goalsRestored: number;
}> {
  return await db.transaction(
    'rw',
    db.accounts,
    db.transactions,
    db.categories,
    db.budgets,
    db.goals,
    async () => {
      if (mode === 'overwrite') {
        await Promise.all([
          db.accounts.clear(),
          db.transactions.clear(),
          db.categories.clear(),
          db.budgets.clear(),
          db.goals.clear(),
        ]);
      }

      const { accounts, transactions, categories, budgets, goals } = backup.data;

      // Restore accounts
      if (accounts.length > 0) {
        if (mode === 'overwrite') {
          await db.accounts.bulkAdd(accounts);
        } else {
          for (const a of accounts) {
            const exists = a.id ? await db.accounts.get(a.id) : null;
            if (!exists) await db.accounts.add(a);
          }
        }
      }

      // Restore categories
      if (categories.length > 0) {
        if (mode === 'overwrite') {
          await db.categories.bulkAdd(categories);
        } else {
          for (const c of categories) {
            const exists = c.id ? await db.categories.get(c.id) : null;
            if (!exists) await db.categories.add(c);
          }
        }
      }

      // Restore transactions
      if (transactions.length > 0) {
        if (mode === 'overwrite') {
          await db.transactions.bulkAdd(transactions);
        } else {
          for (const t of transactions) {
            const exists = t.id ? await db.transactions.get(t.id) : null;
            if (!exists) await db.transactions.add(t);
          }
        }
      }

      // Restore budgets
      if (budgets.length > 0) {
        if (mode === 'overwrite') {
          await db.budgets.bulkAdd(budgets);
        } else {
          for (const b of budgets) {
            const exists = b.id ? await db.budgets.get(b.id) : null;
            if (!exists) await db.budgets.add(b);
          }
        }
      }

      // Restore goals
      if (goals.length > 0) {
        if (mode === 'overwrite') {
          await db.goals.bulkAdd(goals);
        } else {
          for (const g of goals) {
            const exists = g.id ? await db.goals.get(g.id) : null;
            if (!exists) await db.goals.add(g);
          }
        }
      }

      return {
        accountsRestored: accounts.length,
        transactionsRestored: transactions.length,
        categoriesRestored: categories.length,
        budgetsRestored: budgets.length,
        goalsRestored: goals.length,
      };
    }
  );
}

/**
 * Escape a value for RFC 4180 CSV compliance.
 */
function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Export transactions to standard CSV with UTF-8 BOM for Microsoft Excel & Google Sheets.
 */
export async function exportTransactionsCsv(filter?: {
  startDate?: Date;
  endDate?: Date;
  accountId?: number;
}): Promise<string> {
  const [allTxns, accounts, categories] = await Promise.all([
    db.transactions.orderBy('date').reverse().toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
  ]);

  const accountMap = new Map<number, Account>();
  accounts.forEach((a) => accountMap.set(a.id!, a));

  const categoryMap = new Map<number, Category>();
  categories.forEach((c) => categoryMap.set(c.id!, c));

  let txns = allTxns;
  if (filter?.accountId) {
    txns = txns.filter(
      (t) => t.accountId === filter.accountId || t.toAccountId === filter.accountId
    );
  }
  if (filter?.startDate) {
    txns = txns.filter((t) => t.date >= filter.startDate!);
  }
  if (filter?.endDate) {
    txns = txns.filter((t) => t.date <= filter.endDate!);
  }

  const headers = [
    'Date',
    'Time',
    'Type',
    'Account',
    'To Account',
    'Category',
    'Amount (EGP)',
    'Amount (Piastres)',
    'Merchant / Beneficiary',
    'Notes',
    'Reference ID',
    'Original SMS',
  ];

  const rows: string[] = [headers.map(escapeCsv).join(',')];

  for (const t of txns) {
    const acc = accountMap.get(t.accountId);
    const toAcc = t.toAccountId ? accountMap.get(t.toAccountId) : null;
    const cat = t.categoryId ? categoryMap.get(t.categoryId) : null;

    const dateStr = t.date.toISOString().slice(0, 10);
    const timeStr = t.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const amountEgp = (t.amount / 100).toFixed(2);

    rows.push(
      [
        escapeCsv(dateStr),
        escapeCsv(timeStr),
        escapeCsv(t.type),
        escapeCsv(acc ? acc.name : ''),
        escapeCsv(toAcc ? toAcc.name : ''),
        escapeCsv(cat ? cat.name : ''),
        escapeCsv(amountEgp),
        escapeCsv(t.amount),
        escapeCsv(t.merchant || ''),
        escapeCsv(t.note || ''),
        escapeCsv(t.referenceId || ''),
        escapeCsv(t.originalSms || ''),
      ].join(',')
    );
  }

  // Include UTF-8 BOM (\uFEFF) so Excel opens Arabic text correctly
  return `\uFEFF${rows.join('\r\n')}`;
}

/**
 * Trigger download of transactions CSV file in browser.
 */
export async function downloadTransactionsCsv(filter?: {
  startDate?: Date;
  endDate?: Date;
  accountId?: number;
  filename?: string;
}): Promise<void> {
  const csvContent = await exportTransactionsCsv(filter);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const defaultName = filter?.filename || `penny-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
