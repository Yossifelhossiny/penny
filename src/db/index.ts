import Dexie, { type EntityTable } from 'dexie';
import type {
  Person,
  Debt,
  CategoryRule,
  RecurringIncome, Account, Transaction, Category, Budget, SavingsGoal, SmsInboxEntry } from '../types';

const db = new Dexie('PennyDB') as Dexie & {
  accounts: EntityTable<Account, 'id'>;
  transactions: EntityTable<Transaction, 'id'>;
  categories: EntityTable<Category, 'id'>;
  budgets: EntityTable<Budget, 'id'>;
  goals: EntityTable<SavingsGoal, 'id'>;
  smsInbox: EntityTable<SmsInboxEntry, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
  people: EntityTable<Person, 'id'>;
  debts: EntityTable<Debt, 'id'>;
  categoryRules: EntityTable<CategoryRule, 'id'>;
  recurring: EntityTable<RecurringIncome, 'id'>;
};

/** Small key-value store (e.g. the automatic-import push settings). */
export interface MetaEntry {
  key: string;
  value: unknown;
}

// v6 -> v7: people, debts, learned category rules, recurring income (all additive)
db.version(7)
  .stores({
    accounts: '++id, name, type',
    transactions: '++id, type, categoryId, accountId, toAccountId, date, smsFingerprint, referenceId, personId, &recurringKey',
    categories: '++id, name, type',
    budgets: '++id, categoryId, monthKey',
    goals: '++id, name, targetDate',
    smsInbox: '++id, &entryKey, status, receivedAt',
    meta: '&key',
    people: '++id, &key',
    debts: '++id, personId, status',
    categoryRules: '++id, &[key+type], type',
    recurring: '++id',
  })
  .upgrade(async (tx) => {
    const cats = tx.table('categories');
    const hasRent = (await cats.where('name').equals('Rent').toArray()).some((c) => c.type === 'expense');
    if (!hasRent) await cats.add({ name: 'Rent', icon: '🏠', type: 'expense', color: '#7253d6' });
  });

// v5 -> v6: add meta (key-value settings readable by the service worker)
db.version(6).stores({
  accounts: '++id, name, type',
  transactions: '++id, type, categoryId, accountId, toAccountId, date, smsFingerprint, referenceId',
  categories: '++id, name, type',
  budgets: '++id, categoryId, monthKey',
  goals: '++id, name, targetDate',
  smsInbox: '++id, &entryKey, status, receivedAt',
  meta: '&key',
});

// v4 -> v5: add smsInbox (iOS Shortcut auto-import log + pending queue)
db.version(5).stores({
  accounts: '++id, name, type',
  transactions: '++id, type, categoryId, accountId, toAccountId, date, smsFingerprint, referenceId',
  categories: '++id, name, type',
  budgets: '++id, categoryId, monthKey',
  goals: '++id, name, targetDate',
  smsInbox: '++id, &entryKey, status, receivedAt',
});

// v3 -> v4: add budgets and goals tables
db.version(4).stores({
  accounts: '++id, name, type',
  transactions: '++id, type, categoryId, accountId, toAccountId, date, smsFingerprint, referenceId',
  categories: '++id, name, type',
  budgets: '++id, categoryId, monthKey',
  goals: '++id, name, targetDate',
});

// v2 -> v3: add smsFingerprint and referenceId indexes on transactions
db.version(3).stores({
  accounts: '++id, name, type',
  transactions: '++id, type, categoryId, accountId, toAccountId, date, smsFingerprint, referenceId',
  categories: '++id, name, type',
});

// v1 → v2: add openingBalance to accounts, add toAccountId/merchant to transactions,
// transaction type now includes 'transfer'.
db.version(2).stores({
  accounts: '++id, name, type',
  transactions: '++id, type, categoryId, accountId, toAccountId, date',
  categories: '++id, name, type',
}).upgrade(async (tx) => {
  // Migrate existing accounts: treat old `balance` as openingBalance in piastres
  await tx.table('accounts').toCollection().modify((account: Record<string, unknown>) => {
    if (account.openingBalance === undefined) {
      // Old balance was in EGP floats — convert to piastres
      const oldBalance = typeof account.balance === 'number' ? account.balance : 0;
      account.openingBalance = Math.round(oldBalance * 100);
    }
    // Remove old balance field
    delete account.balance;
  });

  // Migrate existing transactions: convert amounts to piastres
  await tx.table('transactions').toCollection().modify((txn: Record<string, unknown>) => {
    if (typeof txn.amount === 'number' && txn.amount !== Math.floor(txn.amount)) {
      txn.amount = Math.round((txn.amount as number) * 100);
    }
  });
});

// Keep v1 schema declaration so Dexie knows the upgrade path
db.version(1).stores({
  accounts: '++id, name, type',
  transactions: '++id, type, categoryId, accountId, date',
  categories: '++id, name, type',
});

export async function seedDefaults() {
  const accountCount = await db.accounts.count();
  if (accountCount === 0) {
    await db.accounts.bulkAdd([
      {
        name: 'Bank Account',
        type: 'bank',
        openingBalance: 0,
        color: '#3b82f6',
        icon: '🏦',
        createdAt: new Date(),
      },
      {
        name: 'Vodafone Cash',
        type: 'vodafone_cash',
        openingBalance: 0,
        color: '#ef4444',
        icon: '📱',
        createdAt: new Date(),
      },
      {
        name: 'Cash Wallet',
        type: 'cash',
        openingBalance: 0,
        color: '#10b981',
        icon: '💵',
        createdAt: new Date(),
      },
    ]);
  }

  const categoryCount = await db.categories.count();
  if (categoryCount === 0) {
    await db.categories.bulkAdd([
      // Income categories
      { name: 'Salary', icon: '💰', type: 'income', color: '#10b981' },
      { name: 'Freelance', icon: '💻', type: 'income', color: '#3b82f6' },
      { name: 'Business', icon: '🏢', type: 'income', color: '#8b5cf6' },
      { name: 'Other Income', icon: '📥', type: 'income', color: '#14b8a6' },
      // Expense categories
      { name: 'Rent', icon: '🏠', type: 'expense', color: '#7253d6' },
      { name: 'Food & Drinks', icon: '🍔', type: 'expense', color: '#f59e0b' },
      { name: 'Transportation', icon: '🚕', type: 'expense', color: '#6366f1' },
      { name: 'Shopping', icon: '🛒', type: 'expense', color: '#ec4899' },
      { name: 'Bills', icon: '📄', type: 'expense', color: '#ef4444' },
      { name: 'Mobile Recharge', icon: '📱', type: 'expense', color: '#f97316' },
      { name: 'Subscriptions', icon: '🔁', type: 'expense', color: '#a855f7' },
      { name: 'Healthcare', icon: '🏥', type: 'expense', color: '#14b8a6' },
      { name: 'Entertainment', icon: '🎮', type: 'expense', color: '#8b5cf6' },
      { name: 'Transfers', icon: '🔄', type: 'expense', color: '#64748b' },
      { name: 'Uncategorized', icon: '❓', type: 'expense', color: '#94a3b8' },
      { name: 'Other', icon: '📦', type: 'expense', color: '#64748b' },
    ]);
  } else {
    // Ensure Uncategorized category exists for existing databases
    const uncategorized = await db.categories.where('name').equals('Uncategorized').first();
    if (!uncategorized) {
      await db.categories.add({
        name: 'Uncategorized',
        icon: '❓',
        type: 'expense',
        color: '#94a3b8',
      });
    }
    const hasRent = (await db.categories.where('name').equals('Rent').toArray()).some((c) => c.type === 'expense');
    if (!hasRent) await db.categories.add({ name: 'Rent', icon: '🏠', type: 'expense', color: '#7253d6' });
  }
}

export { db };
