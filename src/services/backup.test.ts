import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  generateBackupData,
  validateBackupData,
  restoreBackupData,
  exportTransactionsCsv,
} from './backup';
import { generateFinancialReport } from './reports';
import { addIncome, addExpense, addTransfer } from './transactions';
import { setBudget, createSavingsGoal } from './budgets';

describe('backup & reports services', () => {
  let bankId: number;
  let cashId: number;
  let foodCatId: number;
  let salaryCatId: number;

  beforeEach(async () => {
    await db.accounts.clear();
    await db.transactions.clear();
    await db.categories.clear();
    await db.budgets.clear();
    await db.goals.clear();

    bankId = (await db.accounts.add({
      name: 'Bank Account',
      type: 'bank',
      openingBalance: 10_000_00,
      color: '#3b82f6',
      icon: '🏦',
      createdAt: new Date(),
    })) as number;

    cashId = (await db.accounts.add({
      name: 'Cash Wallet',
      type: 'cash',
      openingBalance: 2_000_00,
      color: '#10b981',
      icon: '💵',
      createdAt: new Date(),
    })) as number;

    foodCatId = (await db.categories.add({
      name: 'Food & Drinks',
      icon: '🍔',
      type: 'expense',
      color: '#f59e0b',
    })) as number;

    salaryCatId = (await db.categories.add({
      name: 'Salary',
      icon: '💰',
      type: 'income',
      color: '#10b981',
    })) as number;
  });

  describe('Backup & Restore', () => {
    it('generates full JSON backup with accurate stats and data', async () => {
      await addIncome({
        amount: 8_000_00,
        accountId: bankId,
        categoryId: salaryCatId,
        date: new Date(),
      });
      await addExpense({
        amount: 250_00,
        accountId: bankId,
        categoryId: foodCatId,
        merchant: 'Carrefour, Cairo',
        date: new Date(),
      });
      await setBudget({
        categoryId: foodCatId,
        limitPiastres: 2_000_00,
      });
      await createSavingsGoal({
        name: 'Emergency Fund',
        targetAmountPiastres: 30_000_00,
      });

      const backup = await generateBackupData();
      expect(backup.appName).toBe('Penny');
      expect(backup.stats.accountsCount).toBe(2);
      expect(backup.stats.transactionsCount).toBe(2);
      expect(backup.stats.categoriesCount).toBe(2);
      expect(backup.stats.budgetsCount).toBe(1);
      expect(backup.stats.goalsCount).toBe(1);
    });

    it('validates backup data correctly', () => {
      const valid = validateBackupData({
        appName: 'Penny',
        schemaVersion: 4,
        data: {
          accounts: [],
          transactions: [],
          categories: [],
          budgets: [],
          goals: [],
        },
      });
      expect(valid.valid).toBe(true);
      expect(valid.data).toBeDefined();

      const invalid = validateBackupData({ foo: 'bar' });
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toBeDefined();
    });

    it('restores backup data in overwrite mode', async () => {
      // 1. Initial state has 2 accounts, add 1 transaction
      await addExpense({
        amount: 150_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(),
      });
      const originalBackup = await generateBackupData();

      // 2. Wipe DB or mutate
      await db.transactions.clear();
      await db.accounts.clear();
      expect(await db.transactions.count()).toBe(0);
      expect(await db.accounts.count()).toBe(0);

      // 3. Restore
      const res = await restoreBackupData(originalBackup, 'overwrite');
      expect(res.accountsRestored).toBe(2);
      expect(res.transactionsRestored).toBe(1);

      expect(await db.accounts.count()).toBe(2);
      expect(await db.transactions.count()).toBe(1);
    });
  });

  describe('CSV Export', () => {
    it('exports transactions to RFC 4180 CSV with UTF-8 BOM', async () => {
      await addExpense({
        amount: 350_50,
        accountId: bankId,
        categoryId: foodCatId,
        merchant: 'Gourmet, Zamalek "Special"',
        note: 'Dinner with friends, split bill',
        date: new Date(2026, 10, 15, 20, 30),
      });

      const csv = await exportTransactionsCsv();

      // Check UTF-8 BOM
      expect(csv.startsWith('\uFEFF')).toBe(true);

      // Check headers (each column is RFC 4180 quoted)
      expect(csv).toContain('"Date","Time","Type","Account","To Account","Category","Amount (EGP)"');

      // Check values and escaping of quotes and commas
      expect(csv).toContain('350.50');
      expect(csv).toContain('Bank Account');
      expect(csv).toContain('Food & Drinks');
      expect(csv).toContain('"Gourmet, Zamalek ""Special"""');
      expect(csv).toContain('"Dinner with friends, split bill"');
    });

    it('filters CSV export by account', async () => {
      await addExpense({
        amount: 100_00,
        accountId: bankId,
        categoryId: foodCatId,
        date: new Date(2026, 10, 1),
      });
      await addExpense({
        amount: 50_00,
        accountId: cashId,
        categoryId: foodCatId,
        date: new Date(2026, 10, 2),
      });

      const bankCsv = await exportTransactionsCsv({ accountId: bankId });
      expect(bankCsv).toContain('100.00');
      expect(bankCsv).not.toContain('50.00');
    });
  });

  describe('Financial Reports', () => {
    it('generates monthly financial report with starting and ending net worth', async () => {
      const year = 2026;
      const month = 10; // November

      // Prior transaction in October (adds 5,000 EGP to Bank)
      await addIncome({
        amount: 5_000_00,
        accountId: bankId,
        categoryId: salaryCatId,
        date: new Date(2026, 9, 25),
      });

      // Starting Net Worth at Nov 1 = Bank (10,000 + 5,000) + Cash (2,000) = 17,000 EGP
      // Transactions in November:
      // Income: 10,000 EGP
      await addIncome({
        amount: 10_000_00,
        accountId: bankId,
        categoryId: salaryCatId,
        date: new Date(year, month, 1),
      });

      // Expense: 2,500 EGP Food
      await addExpense({
        amount: 2_500_00,
        accountId: bankId,
        categoryId: foodCatId,
        merchant: 'Supermarket',
        date: new Date(year, month, 5),
      });

      // Transfer: 1,000 EGP Bank -> Cash
      await addTransfer({
        amount: 1_000_00,
        fromAccountId: bankId,
        toAccountId: cashId,
        date: new Date(year, month, 10),
      });

      const report = await generateFinancialReport('monthly', year, month);

      expect(report.startingNetWorthPiastres).toBe(17_000_00);
      expect(report.totalIncomePiastres).toBe(10_000_00);
      expect(report.totalExpensePiastres).toBe(2_500_00);
      expect(report.totalTransferPiastres).toBe(1_000_00);
      expect(report.endingNetWorthPiastres).toBe(17_000_00 + 10_000_00 - 2_500_00); // 24,500 EGP
      expect(report.netWorthChangePiastres).toBe(7_500_00);

      // Account statements
      expect(report.accountStatements.length).toBe(2);
      const bankStmt = report.accountStatements.find((s) => s.accountId === bankId)!;
      expect(bankStmt.startingBalancePiastres).toBe(15_000_00);
      expect(bankStmt.totalInPiastres).toBe(10_000_00); // income
      expect(bankStmt.totalOutPiastres).toBe(2_500_00 + 1_000_00); // expense + transfer out
      expect(bankStmt.endingBalancePiastres).toBe(15_000_00 + 10_000_00 - 3_500_00); // 21,500 EGP

      const cashStmt = report.accountStatements.find((s) => s.accountId === cashId)!;
      expect(cashStmt.startingBalancePiastres).toBe(2_000_00);
      expect(cashStmt.totalInPiastres).toBe(1_000_00); // transfer in
      expect(cashStmt.endingBalancePiastres).toBe(3_000_00);

      // Largest expense
      expect(report.largestExpense).not.toBeNull();
      expect(report.largestExpense!.amountPiastres).toBe(2_500_00);
      expect(report.largestExpense!.merchant).toBe('Supermarket');
    });
  });
});
