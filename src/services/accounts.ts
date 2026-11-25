/**
 * Account Management Service
 *
 * Handles account creation, updates, deletions, statistics,
 * and balance reconciliation.
 */

import { db } from '../db';
import type { Account, AccountType } from '../types';
import { computeAccountBalance, addIncome, addExpense } from './transactions';

export interface AccountStats {
  balance: number; // piastres
  openingBalance: number; // piastres
  totalIncome: number; // piastres
  totalExpenses: number; // piastres
  totalTransfersIn: number; // piastres
  totalTransfersOut: number; // piastres
  transactionCount: number;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  openingBalance: number; // piastres
  color: string;
  icon: string;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccountType;
  openingBalance?: number; // piastres
  color?: string;
  icon?: string;
}

/**
 * Create a new financial account.
 */
export async function createAccount(input: CreateAccountInput): Promise<number> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Account name is required');
  }

  if (!Number.isInteger(input.openingBalance) || input.openingBalance < 0) {
    throw new Error('Opening balance must be a non-negative integer in piastres');
  }

  const account: Account = {
    name: trimmedName,
    type: input.type,
    openingBalance: input.openingBalance,
    color: input.color || '#3b82f6',
    icon: input.icon || '💳',
    createdAt: new Date(),
  };

  const id = await db.accounts.add(account);
  return id as number;
}

/**
 * Update an existing account.
 */
export async function updateAccount(id: number, updates: UpdateAccountInput): Promise<void> {
  const account = await db.accounts.get(id);
  if (!account) {
    throw new Error(`Account ${id} not found`);
  }

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) throw new Error('Account name cannot be empty');
    updates.name = trimmed;
  }

  if (updates.openingBalance !== undefined) {
    if (!Number.isInteger(updates.openingBalance) || updates.openingBalance < 0) {
      throw new Error('Opening balance must be a non-negative integer in piastres');
    }
  }

  await db.accounts.update(id, updates);
}

/**
 * Delete an account safely.
 * Disallows deletion if transactions exist for this account.
 */
export async function deleteAccount(id: number): Promise<{ success: boolean; error?: string }> {
  const account = await db.accounts.get(id);
  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  // Check if any transactions reference this account
  const directTxnCount = await db.transactions.where('accountId').equals(id).count();
  const transferTxnCount = await db.transactions.where('toAccountId').equals(id).count();

  const totalLinked = directTxnCount + transferTxnCount;
  if (totalLinked > 0) {
    return {
      success: false,
      error: `Cannot delete "${account.name}" because it has ${totalLinked} transaction${totalLinked === 1 ? '' : 's'} linked. Reassign or delete the transactions first.`,
    };
  }

  await db.accounts.delete(id);
  return { success: true };
}

/**
 * Get detailed stats and financial flow for a specific account.
 */
export async function getAccountStats(accountId: number): Promise<AccountStats> {
  const account = await db.accounts.get(accountId);
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const balance = await computeAccountBalance(accountId);

  // Incomes into this account
  const incomes = await db.transactions.where({ accountId, type: 'income' }).toArray();
  const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);

  // Expenses from this account
  const expenses = await db.transactions.where({ accountId, type: 'expense' }).toArray();
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);

  // Transfers out of this account
  const transfersOut = await db.transactions.where({ accountId, type: 'transfer' }).toArray();
  const totalTransfersOut = transfersOut.reduce((sum, t) => sum + t.amount, 0);

  // Transfers into this account
  const allTransfers = await db.transactions.where('type').equals('transfer').toArray();
  const transfersIn = allTransfers.filter(t => t.toAccountId === accountId);
  const totalTransfersIn = transfersIn.reduce((sum, t) => sum + t.amount, 0);

  const transactionCount = incomes.length + expenses.length + transfersOut.length + transfersIn.length;

  return {
    balance,
    openingBalance: account.openingBalance,
    totalIncome,
    totalExpenses,
    totalTransfersIn,
    totalTransfersOut,
    transactionCount,
  };
}

/**
 * Reconcile an account balance against actual statement balance.
 *
 * If actual > current: creates an Income adjustment transaction.
 * If actual < current: creates an Expense adjustment transaction.
 * If actual == current: no transaction needed.
 */
export async function reconcileAccountBalance(
  accountId: number,
  actualBalancePiastres: number,
  note?: string
): Promise<{
  discrepancyPiastres: number;
  adjusted: boolean;
  adjustmentTxnId?: number;
}> {
  if (!Number.isInteger(actualBalancePiastres)) {
    throw new Error('Actual balance must be an integer (piastres)');
  }

  const account = await db.accounts.get(accountId);
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const currentBalance = await computeAccountBalance(accountId);
  const diff = actualBalancePiastres - currentBalance;

  if (diff === 0) {
    return {
      discrepancyPiastres: 0,
      adjusted: false,
    };
  }

  // Find or use a category for adjustment
  const categories = await db.categories.toArray();

  let adjustmentTxnId: number | undefined;

  if (diff > 0) {
    // Current is lower than actual -> Add Income adjustment
    const incomeCats = categories.filter(c => c.type === 'income');
    const category = incomeCats.find(c => c.name.toLowerCase().includes('other')) ?? incomeCats[0];
    if (!category) throw new Error('No income category available for adjustment');

    adjustmentTxnId = await addIncome({
      amount: diff,
      accountId,
      categoryId: category.id!,
      merchant: 'Balance Reconciliation',
      note: note || `Reconciliation adjustment (+${(diff / 100).toFixed(2)} EGP)`,
      date: new Date(),
    });
  } else {
    // Current is higher than actual -> Add Expense adjustment
    const expenseDiff = Math.abs(diff);
    const expenseCats = categories.filter(c => c.type === 'expense');
    const category = expenseCats.find(c => c.name.toLowerCase().includes('other') || c.name.toLowerCase().includes('uncategorized')) ?? expenseCats[0];
    if (!category) throw new Error('No expense category available for adjustment');

    adjustmentTxnId = await addExpense({
      amount: expenseDiff,
      accountId,
      categoryId: category.id!,
      merchant: 'Balance Reconciliation',
      note: note || `Reconciliation adjustment (-${(expenseDiff / 100).toFixed(2)} EGP)`,
      date: new Date(),
    });
  }

  return {
    discrepancyPiastres: diff,
    adjusted: true,
    adjustmentTxnId,
  };
}
