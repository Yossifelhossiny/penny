import { db } from '../db';
import type { Transaction, TransactionType } from '../types';

/**
 * Compute the current balance of an account: opening balance + all transaction effects.
 * Returns balance in piastres (integer).
 */
export async function computeAccountBalance(accountId: number): Promise<number> {
  const account = await db.accounts.get(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  let balance = account.openingBalance;

  // Income to this account
  const incomes = await db.transactions
    .where({ accountId, type: 'income' })
    .toArray();
  for (const t of incomes) balance += t.amount;

  // Expenses from this account
  const expenses = await db.transactions
    .where({ accountId, type: 'expense' })
    .toArray();
  for (const t of expenses) balance -= t.amount;

  // Transfers FROM this account (source)
  const transfersOut = await db.transactions
    .where({ accountId, type: 'transfer' })
    .toArray();
  for (const t of transfersOut) balance -= t.amount;

  // Transfers TO this account (destination)
  const allTransfers = await db.transactions
    .where({ type: 'transfer' })
    .toArray();
  for (const t of allTransfers) {
    if (t.toAccountId === accountId) balance += t.amount;
  }

  return balance;
}

/**
 * Get all account balances as a map of accountId → piastres.
 */
export async function getAllBalances(): Promise<Map<number, number>> {
  const accounts = await db.accounts.toArray();
  const transactions = await db.transactions.toArray();
  const balances = new Map<number, number>();

  for (const account of accounts) {
    balances.set(account.id!, account.openingBalance);
  }

  for (const t of transactions) {
    const current = balances.get(t.accountId) ?? 0;
    if (t.type === 'income') {
      balances.set(t.accountId, current + t.amount);
    } else if (t.type === 'expense') {
      balances.set(t.accountId, current - t.amount);
    } else if (t.type === 'transfer') {
      balances.set(t.accountId, current - t.amount);
      const destBalance = balances.get(t.toAccountId!) ?? 0;
      balances.set(t.toAccountId!, destBalance + t.amount);
    }
  }

  return balances;
}

interface AddTransactionInput {
  amount: number; // piastres
  type: TransactionType;
  accountId: number;
  toAccountId?: number;
  categoryId?: number;
  merchant?: string;
  note?: string;
  date: Date;
  originalSms?: string;
  smsFingerprint?: string;
  referenceId?: string;
}

/**
 * Add a new income transaction.
 */
export async function addIncome(input: Omit<AddTransactionInput, 'type'>): Promise<number> {
  validateAmount(input.amount);
  if (!input.categoryId) throw new Error('Category is required for income');

  const categoryId = input.categoryId;
  const txn: Transaction = {
    amount: input.amount,
    type: 'income',
    accountId: input.accountId,
    categoryId,
    merchant: input.merchant,
    note: input.note,
    date: input.date,
    createdAt: new Date(),
    originalSms: input.originalSms,
    smsFingerprint: input.smsFingerprint,
    referenceId: input.referenceId,
  };

  const id = await db.transactions.add(txn);
  return id as number;
}

/**
 * Add a new expense transaction.
 */
export async function addExpense(input: Omit<AddTransactionInput, 'type'>): Promise<number> {
  validateAmount(input.amount);
  if (!input.categoryId) throw new Error('Category is required for expense');

  const categoryId = input.categoryId;
  const txn: Transaction = {
    amount: input.amount,
    type: 'expense',
    accountId: input.accountId,
    categoryId,
    merchant: input.merchant,
    note: input.note,
    date: input.date,
    createdAt: new Date(),
    originalSms: input.originalSms,
    smsFingerprint: input.smsFingerprint,
    referenceId: input.referenceId,
  };

  const id = await db.transactions.add(txn);
  return id as number;
}

/**
 * Add a transfer between two accounts.
 * Uses a Dexie transaction to ensure atomicity.
 */
export async function addTransfer(input: {
  amount: number;
  fromAccountId: number;
  toAccountId: number;
  note?: string;
  date: Date;
  originalSms?: string;
  smsFingerprint?: string;
  referenceId?: string;
}): Promise<number> {
  validateAmount(input.amount);
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Source and destination accounts must be different');
  }

  // Verify both accounts exist inside a Dexie transaction
  return await db.transaction('rw', db.transactions, db.accounts, async () => {
    const fromAccount = await db.accounts.get(input.fromAccountId);
    const toAccount = await db.accounts.get(input.toAccountId);
    if (!fromAccount) throw new Error('Source account not found');
    if (!toAccount) throw new Error('Destination account not found');

    const txn: Transaction = {
      amount: input.amount,
      type: 'transfer',
      accountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      note: input.note,
      date: input.date,
      createdAt: new Date(),
      originalSms: input.originalSms,
      smsFingerprint: input.smsFingerprint,
      referenceId: input.referenceId,
    };

    const id = await db.transactions.add(txn);
    return id as number;
  });
}

/**
 * Edit an existing transaction.
 * Uses a Dexie transaction for safety.
 */
export async function editTransaction(
  id: number,
  updates: Partial<Omit<Transaction, 'id' | 'createdAt'>>
): Promise<void> {
  if (updates.amount !== undefined) validateAmount(updates.amount);

  await db.transaction('rw', db.transactions, db.accounts, async () => {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error(`Transaction ${id} not found`);

    // If changing type to transfer, require toAccountId
    if (updates.type === 'transfer' || (existing.type === 'transfer' && updates.type === undefined)) {
      const toAccountId = updates.toAccountId ?? existing.toAccountId;
      const accountId = updates.accountId ?? existing.accountId;
      if (!toAccountId) throw new Error('Transfer requires a destination account');
      if (accountId === toAccountId) {
        throw new Error('Source and destination accounts must be different');
      }
    }

    await db.transactions.update(id, updates);
  });
}

/**
 * Delete a transaction.
 */
export async function deleteTransaction(id: number): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error(`Transaction ${id} not found`);
    await db.transactions.delete(id);
  });
}

/**
 * Get monthly totals for income and expenses (excluding transfers).
 */
export async function getMonthlyTotals(year: number, month: number): Promise<{
  income: number;
  expenses: number;
}> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const transactions = await db.transactions
    .where('date')
    .between(start, end, true, true)
    .toArray();

  let income = 0;
  let expenses = 0;

  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expenses += t.amount;
    // transfers are NOT counted
  }

  return { income, expenses };
}

/**
 * Get recent transactions, sorted newest first.
 */
export async function getRecentTransactions(limit: number = 10): Promise<Transaction[]> {
  return await db.transactions
    .orderBy('date')
    .reverse()
    .limit(limit)
    .toArray();
}

/**
 * Get transactions with optional filters.
 */
export async function getFilteredTransactions(filters: {
  type?: TransactionType;
  accountId?: number;
  startDate?: Date;
  endDate?: Date;
}): Promise<Transaction[]> {
  const collection = db.transactions.orderBy('date').reverse();

  let results = await collection.toArray();

  if (filters.type) {
    results = results.filter(t => t.type === filters.type);
  }
  if (filters.accountId) {
    results = results.filter(t =>
      t.accountId === filters.accountId || t.toAccountId === filters.accountId
    );
  }
  if (filters.startDate) {
    results = results.filter(t => t.date >= filters.startDate!);
  }
  if (filters.endDate) {
    results = results.filter(t => t.date <= filters.endDate!);
  }

  return results;
}

function validateAmount(amount: number): void {
  if (!Number.isInteger(amount)) {
    throw new Error('Amount must be an integer (piastres)');
  }
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
}
