import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountStats,
  reconcileAccountBalance,
} from './accounts';
import { addIncome, addExpense, addTransfer, computeAccountBalance } from './transactions';

describe('accounts service', () => {
  let bankId: number;
  let cashId: number;
  let categoryId: number;

  beforeEach(async () => {
    await db.accounts.clear();
    await db.transactions.clear();
    await db.categories.clear();

    bankId = await db.accounts.add({
      name: 'Bank Account',
      type: 'bank',
      openingBalance: 5_000_00, // 5,000 EGP
      color: '#3b82f6',
      icon: '🏦',
      createdAt: new Date(),
    }) as number;

    cashId = await db.accounts.add({
      name: 'Cash Wallet',
      type: 'cash',
      openingBalance: 1_000_00, // 1,000 EGP
      color: '#10b981',
      icon: '💵',
      createdAt: new Date(),
    }) as number;

    categoryId = await db.categories.add({
      name: 'General',
      icon: '📦',
      type: 'expense',
      color: '#64748b',
    }) as number;

    await db.categories.add({
      name: 'Other Income',
      icon: '💰',
      type: 'income',
      color: '#10b981',
    });
  });

  describe('createAccount', () => {
    it('creates account successfully with opening balance', async () => {
      const id = await createAccount({
        name: 'Telda Card',
        type: 'bank',
        openingBalance: 250_00, // 250 EGP
        color: '#f59e0b',
        icon: '💳',
      });

      const acc = await db.accounts.get(id);
      expect(acc).toBeDefined();
      expect(acc!.name).toBe('Telda Card');
      expect(acc!.openingBalance).toBe(25000);
      expect(await computeAccountBalance(id)).toBe(25000);
    });

    it('rejects empty account name', async () => {
      await expect(
        createAccount({
          name: '   ',
          type: 'bank',
          openingBalance: 0,
          color: '#3b82f6',
          icon: '🏦',
        })
      ).rejects.toThrow('Account name is required');
    });

    it('rejects invalid or negative opening balance', async () => {
      await expect(
        createAccount({
          name: 'Test',
          type: 'cash',
          openingBalance: -100,
          color: '#3b82f6',
          icon: '💵',
        })
      ).rejects.toThrow('non-negative integer');

      await expect(
        createAccount({
          name: 'Test',
          type: 'cash',
          openingBalance: 10.5,
          color: '#3b82f6',
          icon: '💵',
        })
      ).rejects.toThrow('non-negative integer');
    });
  });

  describe('updateAccount', () => {
    it('updates account name and color', async () => {
      await updateAccount(bankId, {
        name: 'CIB Bank',
        color: '#2563eb',
        icon: '🏛️',
      });

      const acc = await db.accounts.get(bankId);
      expect(acc!.name).toBe('CIB Bank');
      expect(acc!.color).toBe('#2563eb');
      expect(acc!.icon).toBe('🏛️');
    });

    it('updates opening balance', async () => {
      await updateAccount(cashId, {
        openingBalance: 2_000_00,
      });

      const balance = await computeAccountBalance(cashId);
      expect(balance).toBe(2_000_00);
    });
  });

  describe('deleteAccount', () => {
    it('allows deleting account when no transactions exist', async () => {
      const newAccId = await createAccount({
        name: 'Unused Account',
        type: 'cash',
        openingBalance: 0,
        color: '#10b981',
        icon: '💵',
      });

      const result = await deleteAccount(newAccId);
      expect(result.success).toBe(true);

      const found = await db.accounts.get(newAccId);
      expect(found).toBeUndefined();
    });

    it('prevents deleting account when transactions exist', async () => {
      await addExpense({
        amount: 50_00,
        accountId: bankId,
        categoryId,
        date: new Date(),
      });

      const result = await deleteAccount(bankId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('linked');

      const found = await db.accounts.get(bankId);
      expect(found).toBeDefined();
    });
  });

  describe('getAccountStats', () => {
    it('computes account flow, transfers, and balance accurately', async () => {
      // 1. Add income to bank (1,000 EGP)
      const incomeCat = (await db.categories.where('type').equals('income').first())!;
      await addIncome({
        amount: 1_000_00,
        accountId: bankId,
        categoryId: incomeCat.id!,
        date: new Date(),
      });

      // 2. Add expense from bank (200 EGP)
      await addExpense({
        amount: 200_00,
        accountId: bankId,
        categoryId,
        date: new Date(),
      });

      // 3. Transfer from bank to cash (500 EGP)
      await addTransfer({
        amount: 500_00,
        fromAccountId: bankId,
        toAccountId: cashId,
        date: new Date(),
      });

      const bankStats = await getAccountStats(bankId);
      expect(bankStats.openingBalance).toBe(5_000_00);
      expect(bankStats.totalIncome).toBe(1_000_00);
      expect(bankStats.totalExpenses).toBe(200_00);
      expect(bankStats.totalTransfersOut).toBe(500_00);
      expect(bankStats.totalTransfersIn).toBe(0);
      expect(bankStats.balance).toBe(5_000_00 + 1_000_00 - 200_00 - 500_00); // 5,300 EGP
      expect(bankStats.transactionCount).toBe(3);

      const cashStats = await getAccountStats(cashId);
      expect(cashStats.openingBalance).toBe(1_000_00);
      expect(cashStats.totalTransfersIn).toBe(500_00);
      expect(cashStats.balance).toBe(1_000_00 + 500_00); // 1,500 EGP
      expect(cashStats.transactionCount).toBe(1);
    });
  });

  describe('reconcileAccountBalance', () => {
    it('handles perfect balance match with no adjustment', async () => {
      // Current bank balance is 5,000 EGP
      const result = await reconcileAccountBalance(bankId, 5_000_00);
      expect(result.adjusted).toBe(false);
      expect(result.discrepancyPiastres).toBe(0);
      expect(await computeAccountBalance(bankId)).toBe(5_000_00);
    });

    it('creates income adjustment when actual balance is higher', async () => {
      // Current is 5,000 EGP; actual statement says 5,250 EGP (e.g. unrecorded interest/bonus)
      const result = await reconcileAccountBalance(bankId, 5_250_00, 'Bank statement check');
      expect(result.adjusted).toBe(true);
      expect(result.discrepancyPiastres).toBe(250_00);

      // Verify the new computed balance exactly equals the actual statement balance
      const newBalance = await computeAccountBalance(bankId);
      expect(newBalance).toBe(5_250_00);

      // Check transaction created
      const txn = await db.transactions.get(result.adjustmentTxnId!);
      expect(txn).toBeDefined();
      expect(txn!.type).toBe('income');
      expect(txn!.amount).toBe(250_00);
      expect(txn!.merchant).toBe('Balance Reconciliation');
    });

    it('creates expense adjustment when actual balance is lower', async () => {
      // Current is 5,000 EGP; actual statement says 4,800 EGP (e.g. cash expenses missed)
      const result = await reconcileAccountBalance(bankId, 4_800_00, 'End of month reconciliation');
      expect(result.adjusted).toBe(true);
      expect(result.discrepancyPiastres).toBe(-200_00);

      // Verify the new computed balance exactly equals the actual statement balance
      const newBalance = await computeAccountBalance(bankId);
      expect(newBalance).toBe(4_800_00);

      // Check transaction created
      const txn = await db.transactions.get(result.adjustmentTxnId!);
      expect(txn).toBeDefined();
      expect(txn!.type).toBe('expense');
      expect(txn!.amount).toBe(200_00);
      expect(txn!.merchant).toBe('Balance Reconciliation');
    });
  });
});
