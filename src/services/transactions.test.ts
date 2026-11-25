import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  computeAccountBalance,
  getAllBalances,
  addIncome,
  addExpense,
  addTransfer,
  editTransaction,
  deleteTransaction,
  getMonthlyTotals,
  getRecentTransactions,
  getFilteredTransactions,
} from './transactions';

/**
 * Helper: create test accounts directly in the DB and return their IDs.
 */
async function seedTestAccounts() {
  const bankId = await db.accounts.add({
    name: 'Bank',
    type: 'bank',
    openingBalance: 1000_00, // 1000 EGP in piastres
    color: '#3b82f6',
    icon: '🏦',
    createdAt: new Date(),
  });

  const cashId = await db.accounts.add({
    name: 'Cash',
    type: 'cash',
    openingBalance: 500_00, // 500 EGP in piastres
    color: '#10b981',
    icon: '💵',
    createdAt: new Date(),
  });

  const vodafoneId = await db.accounts.add({
    name: 'Vodafone Cash',
    type: 'vodafone_cash',
    openingBalance: 0,
    color: '#ef4444',
    icon: '📱',
    createdAt: new Date(),
  });

  // Seed a category for income and expense
  const salaryId = await db.categories.add({
    name: 'Salary',
    icon: '💰',
    type: 'income',
    color: '#10b981',
  });

  const foodId = await db.categories.add({
    name: 'Food & Drinks',
    icon: '🍔',
    type: 'expense',
    color: '#f59e0b',
  });

  return {
    bankId: bankId as number,
    cashId: cashId as number,
    vodafoneId: vodafoneId as number,
    salaryId: salaryId as number,
    foodId: foodId as number,
  };
}

beforeEach(async () => {
  // Clear all tables before each test
  await db.transactions.clear();
  await db.accounts.clear();
  await db.categories.clear();
});

// ─── Income ──────────────────────────────────────────────

describe('addIncome', () => {
  it('adds an income transaction and increases account balance', async () => {
    const { bankId, salaryId } = await seedTestAccounts();

    const txnId = await addIncome({
      amount: 5000_00, // 5000 EGP
      accountId: bankId,
      categoryId: salaryId,
      date: new Date(2025, 0, 15),
    });

    expect(txnId).toBeGreaterThan(0);

    const balance = await computeAccountBalance(bankId);
    // 1000 EGP opening + 5000 EGP income = 6000 EGP = 600000 piastres
    expect(balance).toBe(600_000);
  });

  it('requires a category for income', async () => {
    const { bankId } = await seedTestAccounts();

    await expect(
      addIncome({
        amount: 100_00,
        accountId: bankId,
        date: new Date(),
      })
    ).rejects.toThrow('Category is required');
  });
});

// ─── Expense ─────────────────────────────────────────────

describe('addExpense', () => {
  it('adds an expense transaction and decreases account balance', async () => {
    const { bankId, foodId } = await seedTestAccounts();

    await addExpense({
      amount: 150_50, // 150.50 EGP
      accountId: bankId,
      categoryId: foodId,
      merchant: 'McDonald\'s',
      date: new Date(2025, 0, 20),
    });

    const balance = await computeAccountBalance(bankId);
    // 1000 EGP opening - 150.50 EGP expense = 849.50 EGP = 84950 piastres
    expect(balance).toBe(84_950);
  });

  it('requires a category for expense', async () => {
    const { bankId } = await seedTestAccounts();

    await expect(
      addExpense({
        amount: 100_00,
        accountId: bankId,
        date: new Date(),
      })
    ).rejects.toThrow('Category is required');
  });
});

// ─── Transfers ───────────────────────────────────────────

describe('addTransfer', () => {
  it('decreases source balance and increases destination balance', async () => {
    const { bankId, cashId } = await seedTestAccounts();

    await addTransfer({
      amount: 200_00, // 200 EGP
      fromAccountId: bankId,
      toAccountId: cashId,
      date: new Date(2025, 0, 25),
    });

    const bankBalance = await computeAccountBalance(bankId);
    const cashBalance = await computeAccountBalance(cashId);

    // Bank: 1000 - 200 = 800 EGP = 80000 piastres
    expect(bankBalance).toBe(80_000);
    // Cash: 500 + 200 = 700 EGP = 70000 piastres
    expect(cashBalance).toBe(70_000);
  });

  it('prevents transfer to the same account', async () => {
    const { bankId } = await seedTestAccounts();

    await expect(
      addTransfer({
        amount: 100_00,
        fromAccountId: bankId,
        toAccountId: bankId,
        date: new Date(),
      })
    ).rejects.toThrow('Source and destination accounts must be different');
  });

  it('validates that both accounts exist', async () => {
    const { bankId } = await seedTestAccounts();

    await expect(
      addTransfer({
        amount: 100_00,
        fromAccountId: bankId,
        toAccountId: 9999,
        date: new Date(),
      })
    ).rejects.toThrow('Destination account not found');
  });
});

// ─── Transfers excluded from income/expenses ─────────────

describe('getMonthlyTotals', () => {
  it('excludes transfers from income and expense totals', async () => {
    const { bankId, cashId, salaryId, foodId } = await seedTestAccounts();
    const month = 0; // January
    const year = 2025;

    await addIncome({
      amount: 10_000_00,
      accountId: bankId,
      categoryId: salaryId,
      date: new Date(year, month, 1),
    });

    await addExpense({
      amount: 500_00,
      accountId: bankId,
      categoryId: foodId,
      date: new Date(year, month, 5),
    });

    await addTransfer({
      amount: 2_000_00,
      fromAccountId: bankId,
      toAccountId: cashId,
      date: new Date(year, month, 10),
    });

    const totals = await getMonthlyTotals(year, month);

    // Transfer must NOT count
    expect(totals.income).toBe(10_000_00);
    expect(totals.expenses).toBe(500_00);
  });
});

// ─── Editing ─────────────────────────────────────────────

describe('editTransaction', () => {
  it('updates a transaction amount', async () => {
    const { bankId, foodId } = await seedTestAccounts();

    const txnId = await addExpense({
      amount: 100_00,
      accountId: bankId,
      categoryId: foodId,
      date: new Date(2025, 0, 1),
    });

    await editTransaction(txnId, { amount: 200_00 });

    const txn = await db.transactions.get(txnId);
    expect(txn!.amount).toBe(200_00);

    // Balance should reflect the new amount
    const balance = await computeAccountBalance(bankId);
    // 1000 EGP - 200 EGP = 800 EGP = 80000 piastres
    expect(balance).toBe(80_000);
  });

  it('throws for non-existent transaction', async () => {
    await expect(
      editTransaction(9999, { amount: 100_00 })
    ).rejects.toThrow('Transaction 9999 not found');
  });

  it('validates updated amount', async () => {
    const { bankId, foodId } = await seedTestAccounts();

    const txnId = await addExpense({
      amount: 100_00,
      accountId: bankId,
      categoryId: foodId,
      date: new Date(),
    });

    // Non-integer
    await expect(
      editTransaction(txnId, { amount: 99.5 })
    ).rejects.toThrow('Amount must be an integer');

    // Negative
    await expect(
      editTransaction(txnId, { amount: -100 })
    ).rejects.toThrow('Amount must be positive');
  });
});

// ─── Deleting ────────────────────────────────────────────

describe('deleteTransaction', () => {
  it('removes a transaction and restores balance', async () => {
    const { bankId, foodId } = await seedTestAccounts();

    const txnId = await addExpense({
      amount: 300_00,
      accountId: bankId,
      categoryId: foodId,
      date: new Date(),
    });

    // Balance after expense: 1000 - 300 = 700 EGP
    expect(await computeAccountBalance(bankId)).toBe(70_000);

    await deleteTransaction(txnId);

    // Balance restored to opening: 1000 EGP
    expect(await computeAccountBalance(bankId)).toBe(100_000);
  });

  it('throws for non-existent transaction', async () => {
    await expect(deleteTransaction(9999)).rejects.toThrow(
      'Transaction 9999 not found'
    );
  });
});

// ─── EGP Precision (integer piastres) ────────────────────

describe('EGP precision', () => {
  it('rejects floating-point amounts', async () => {
    const { bankId, salaryId } = await seedTestAccounts();

    await expect(
      addIncome({
        amount: 99.99, // not an integer
        accountId: bankId,
        categoryId: salaryId,
        date: new Date(),
      })
    ).rejects.toThrow('Amount must be an integer');
  });

  it('rejects zero amount', async () => {
    const { bankId, salaryId } = await seedTestAccounts();

    await expect(
      addIncome({
        amount: 0,
        accountId: bankId,
        categoryId: salaryId,
        date: new Date(),
      })
    ).rejects.toThrow('Amount must be positive');
  });

  it('rejects negative amount', async () => {
    const { bankId, salaryId } = await seedTestAccounts();

    await expect(
      addIncome({
        amount: -500,
        accountId: bankId,
        categoryId: salaryId,
        date: new Date(),
      })
    ).rejects.toThrow('Amount must be positive');
  });

  it('handles precise piastre arithmetic across multiple operations', async () => {
    const { bankId, cashId, salaryId, foodId } = await seedTestAccounts();

    // Income: 1234.56 EGP = 123456 piastres
    await addIncome({
      amount: 123_456,
      accountId: bankId,
      categoryId: salaryId,
      date: new Date(2025, 0, 1),
    });

    // Expense: 99.99 EGP = 9999 piastres
    await addExpense({
      amount: 9_999,
      accountId: bankId,
      categoryId: foodId,
      date: new Date(2025, 0, 2),
    });

    // Transfer: 0.01 EGP = 1 piastre
    await addTransfer({
      amount: 1,
      fromAccountId: bankId,
      toAccountId: cashId,
      date: new Date(2025, 0, 3),
    });

    const bankBalance = await computeAccountBalance(bankId);
    // 100000 + 123456 - 9999 - 1 = 213456 piastres = 2134.56 EGP
    expect(bankBalance).toBe(213_456);

    const cashBalance = await computeAccountBalance(cashId);
    // 50000 + 1 = 50001 piastres = 500.01 EGP
    expect(cashBalance).toBe(50_001);
  });
});

// ─── getAllBalances ───────────────────────────────────────

describe('getAllBalances', () => {
  it('computes all balances in one pass', async () => {
    const { bankId, cashId, vodafoneId, salaryId, foodId } = await seedTestAccounts();

    await addIncome({
      amount: 5_000_00,
      accountId: bankId,
      categoryId: salaryId,
      date: new Date(),
    });

    await addExpense({
      amount: 100_00,
      accountId: cashId,
      categoryId: foodId,
      date: new Date(),
    });

    await addTransfer({
      amount: 300_00,
      fromAccountId: bankId,
      toAccountId: vodafoneId,
      date: new Date(),
    });

    const balances = await getAllBalances();

    // Bank: 1000 + 5000 - 300 = 5700 EGP
    expect(balances.get(bankId)).toBe(570_000);
    // Cash: 500 - 100 = 400 EGP
    expect(balances.get(cashId)).toBe(40_000);
    // Vodafone: 0 + 300 = 300 EGP
    expect(balances.get(vodafoneId)).toBe(30_000);
  });
});

// ─── Filtered & recent transactions ─────────────────────

describe('getRecentTransactions', () => {
  it('returns transactions sorted newest first', async () => {
    const { bankId, salaryId, foodId } = await seedTestAccounts();

    await addIncome({
      amount: 100_00,
      accountId: bankId,
      categoryId: salaryId,
      date: new Date(2025, 0, 1),
    });

    await addExpense({
      amount: 50_00,
      accountId: bankId,
      categoryId: foodId,
      date: new Date(2025, 0, 15),
    });

    await addIncome({
      amount: 200_00,
      accountId: bankId,
      categoryId: salaryId,
      date: new Date(2025, 0, 30),
    });

    const recent = await getRecentTransactions(2);
    expect(recent).toHaveLength(2);
    // Most recent first
    expect(recent[0].amount).toBe(200_00);
    expect(recent[1].amount).toBe(50_00);
  });
});

describe('getFilteredTransactions', () => {
  it('filters by type', async () => {
    const { bankId, cashId, salaryId, foodId } = await seedTestAccounts();

    await addIncome({
      amount: 100_00,
      accountId: bankId,
      categoryId: salaryId,
      date: new Date(),
    });

    await addExpense({
      amount: 50_00,
      accountId: bankId,
      categoryId: foodId,
      date: new Date(),
    });

    await addTransfer({
      amount: 25_00,
      fromAccountId: bankId,
      toAccountId: cashId,
      date: new Date(),
    });

    const incomes = await getFilteredTransactions({ type: 'income' });
    expect(incomes).toHaveLength(1);
    expect(incomes[0].type).toBe('income');

    const transfers = await getFilteredTransactions({ type: 'transfer' });
    expect(transfers).toHaveLength(1);
    expect(transfers[0].type).toBe('transfer');
  });

  it('filters by account (includes transfers to account)', async () => {
    const { bankId, cashId, salaryId, foodId } = await seedTestAccounts();

    await addIncome({
      amount: 100_00,
      accountId: bankId,
      categoryId: salaryId,
      date: new Date(),
    });

    await addExpense({
      amount: 50_00,
      accountId: cashId,
      categoryId: foodId,
      date: new Date(),
    });

    // Transfer from bank to cash — should show for both accounts
    await addTransfer({
      amount: 25_00,
      fromAccountId: bankId,
      toAccountId: cashId,
      date: new Date(),
    });

    const cashTxns = await getFilteredTransactions({ accountId: cashId });
    // Should include expense + transfer (toAccountId)
    expect(cashTxns).toHaveLength(2);
  });
});
