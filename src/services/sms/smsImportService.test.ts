import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import type { Account, Category } from '../../types';
import {
  splitSmsMessages,
  processSmsBatch,
  saveConfirmedReviewItems,
} from './smsImportService';
import { computeAccountBalance } from '../transactions';

describe('smsImportService', () => {
  let testAccounts: Account[] = [];
  let testCategories: Category[] = [];

  beforeEach(async () => {
    await db.accounts.clear();
    await db.transactions.clear();
    await db.categories.clear();

    await db.accounts.add({
      name: 'Bank Account',
      type: 'bank',
      openingBalance: 10_000_00, // 10,000 EGP
      color: '#3b82f6',
      icon: '🏦',
      createdAt: new Date(),
    });

    await db.accounts.add({
      name: 'Vodafone Cash',
      type: 'vodafone_cash',
      openingBalance: 2_000_00, // 2,000 EGP
      color: '#ef4444',
      icon: '📱',
      createdAt: new Date(),
    });

    await db.accounts.add({
      name: 'Cash Wallet',
      type: 'cash',
      openingBalance: 500_00, // 500 EGP
      color: '#10b981',
      icon: '💵',
      createdAt: new Date(),
    });

    await db.categories.add({
      name: 'Shopping',
      icon: '🛒',
      type: 'expense',
      color: '#ec4899',
    });

    await db.categories.add({
      name: 'Salary',
      icon: '💰',
      type: 'income',
      color: '#10b981',
    });

    await db.categories.add({
      name: 'Bills',
      icon: '📄',
      type: 'expense',
      color: '#ef4444',
    });

    await db.categories.add({
      name: 'Transfers',
      icon: '🔄',
      type: 'expense',
      color: '#64748b',
    });

    await db.categories.add({
      name: 'Uncategorized',
      icon: '❓',
      type: 'expense',
      color: '#94a3b8',
    });

    testAccounts = await db.accounts.toArray();
    testCategories = await db.categories.toArray();
  });

  describe('splitSmsMessages', () => {
    it('splits messages separated by blank lines', () => {
      const input = `تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB

تم استلام 200 EGP من 01015147307 / Mohamed K Eissa`;

      const result = splitSmsMessages(input);
      expect(result.length).toBe(2);
      expect(result[0]).toContain('PAYMOB');
      expect(result[1]).toContain('Mohamed K Eissa');
    });

    it('splits messages separated by delimiter lines', () => {
      const input = `تم خصم 160.00EGP من بطاقة رقم 3956
---
تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP
===
رصيد بطاقة رقم 3956 المتاح 5000.00 EGP`;

      const result = splitSmsMessages(input);
      expect(result.length).toBe(3);
    });

    it('handles single message cleanly', () => {
      const input = '   تم خصم 160.00EGP من بطاقة رقم 3956   ';
      const result = splitSmsMessages(input);
      expect(result.length).toBe(1);
      expect(result[0]).toBe('تم خصم 160.00EGP من بطاقة رقم 3956');
    });

    it('returns empty array for empty or whitespace text', () => {
      expect(splitSmsMessages('')).toEqual([]);
      expect(splitSmsMessages('   \n\t  ')).toEqual([]);
    });
  });

  describe('processSmsBatch', () => {
    it('processes card purchase and detects unresolved date without year', async () => {
      const sms = 'تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA يوم 09/05 الساعه 17:09 المتاح 3313.78 للمزيد إتصل ب 19623';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      expect(items.length).toBe(1);
      const item = items[0];

      expect(item.action).toBe('expense');
      expect(item.amountEgp).toBe('160.00');
      expect(item.merchant).toContain('PAYMOB');
      expect(item.dateUnresolved).toBe(true); // Bank SMS has no year!
      expect(item.dateWarning).toContain('Missing year');
      expect(item.selected).toBe(true);
    });

    it('processes ATM withdrawal as Bank -> Cash Wallet transfer', async () => {
      const sms = 'تم سحب 2000.00EGP من بطاقة المدفوعة مقدماً رقم 3956 سحب من الصراف يوم 11/05 الساعه 14:00 المتاح 6313.78 للمزيد إتصل ب 19623';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      expect(items.length).toBe(1);
      const item = items[0];

      expect(item.action).toBe('transfer');
      expect(item.amountEgp).toBe('2000.00');
      const bankAcc = testAccounts.find(a => a.type === 'bank')!;
      const cashAcc = testAccounts.find(a => a.type === 'cash')!;
      expect(item.accountId).toBe(bankAcc.id);
      expect(item.toAccountId).toBe(cashAcc.id);
      expect(item.selected).toBe(true);
    });

    it('processes Vodafone Cash with separate fee', async () => {
      const sms = 'تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-05-07 21:37';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      expect(items.length).toBe(1);
      const item = items[0];

      expect(item.amountEgp).toBe('600.00');
      expect(item.hasFee).toBe(true);
      expect(item.feeEgp).toBe('1.00');
      expect(item.includeFeeAsExpense).toBe(true);
      expect(item.parsed.referenceId).toBe('019799986433');
      expect(item.dateUnresolved).toBe(false); // Vodafone Cash format YY-MM-DD includes year
    });

    it('processes balance-only notification as non-transaction (ignore)', async () => {
      const sms = 'رصيد بطاقة رقم 3956 المتاح 5000.00 EGP';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      expect(items.length).toBe(1);
      const item = items[0];

      expect(item.isBalanceOnly).toBe(true);
      expect(item.action).toBe('ignore');
      expect(item.selected).toBe(false); // Must NOT be selected for save
    });

    it('flags duplicates within the same batch', async () => {
      const sms = `تم استلام 200 EGP من 01015147307 / Mohamed K Eissa معرف 019756663531 13:32 26-05-06

تم استلام 200 EGP من 01015147307 / Mohamed K Eissa معرف 019756663531 13:32 26-05-06`;

      const items = await processSmsBatch(sms, testAccounts, testCategories);

      expect(items.length).toBe(2);
      expect(items[0].isBatchDuplicate).toBe(false);
      expect(items[0].selected).toBe(true);

      expect(items[1].isBatchDuplicate).toBe(true);
      expect(items[1].selected).toBe(false); // duplicate is unselected by default
    });
  });

  describe('saveConfirmedReviewItems', () => {
    it('saves confirmed transaction and preserves original SMS text', async () => {
      const sms = 'تم استلام 200 EGP من 01015147307 / Mohamed K Eissa معرف 019756663531 13:32 26-05-06';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      const result = await saveConfirmedReviewItems(items);
      expect(result.savedCount).toBe(1);
      expect(result.errors).toEqual([]);

      const savedTxns = await db.transactions.toArray();
      expect(savedTxns.length).toBe(1);
      expect(savedTxns[0].amount).toBe(20000); // 200 EGP in piastres
      expect(savedTxns[0].type).toBe('income');
      expect(savedTxns[0].referenceId).toBe('019756663531');
      expect(savedTxns[0].originalSms).toBe(sms); // Original SMS preserved!
    });

    it('handles ATM withdrawal by transferring from Bank to Cash Wallet', async () => {
      const sms = 'تم سحب 2000.00EGP من بطاقة المدفوعة مقدماً رقم 3956 سحب من الصراف يوم 11/05 الساعه 14:00 المتاح 6313.78 للمزيد إتصل ب 19623';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      const bankAcc = testAccounts.find(a => a.type === 'bank')!;
      const cashAcc = testAccounts.find(a => a.type === 'cash')!;

      const initialBankBal = await computeAccountBalance(bankAcc.id!);
      const initialCashBal = await computeAccountBalance(cashAcc.id!);

      await saveConfirmedReviewItems(items);

      const finalBankBal = await computeAccountBalance(bankAcc.id!);
      const finalCashBal = await computeAccountBalance(cashAcc.id!);

      // Bank decreased by 2,000 EGP
      expect(finalBankBal).toBe(initialBankBal - 2000_00);
      // Cash increased by 2,000 EGP
      expect(finalCashBal).toBe(initialCashBal + 2000_00);
      // Total money across accounts remains exactly identical
      expect(finalBankBal + finalCashBal).toBe(initialBankBal + initialCashBal);
    });

    it('saves Vodafone Cash transfer and separate fee transaction', async () => {
      const sms = 'تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-05-07 21:37';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      const result = await saveConfirmedReviewItems(items);
      expect(result.savedCount).toBe(1); // Main transfer/expense
      expect(result.feeCount).toBe(1); // Separate fee expense

      const allTxns = await db.transactions.toArray();
      expect(allTxns.length).toBe(2);

      const mainTxn = allTxns.find(t => t.amount === 60000)!;
      expect(mainTxn).toBeDefined();
      expect(mainTxn.referenceId).toBe('019799986433');

      const feeTxn = allTxns.find(t => t.amount === 100)!; // 1 EGP fee
      expect(feeTxn).toBeDefined();
      expect(feeTxn.type).toBe('expense');
    });

    it('does NOT save balance-only messages', async () => {
      const sms = 'رصيد بطاقة رقم 3956 المتاح 5000.00 EGP';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      const result = await saveConfirmedReviewItems(items);
      expect(result.savedCount).toBe(0);

      const count = await db.transactions.count();
      expect(count).toBe(0);
    });

    it('allows editing fields before saving', async () => {
      const sms = 'تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA يوم 09/05 الساعه 17:09 المتاح 3313.78 للمزيد إتصل ب 19623';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      // User edits amount, merchant, and note
      items[0].amountEgp = '175.50';
      items[0].merchant = 'Vasko Clothing Store';
      items[0].note = 'Black t-shirt purchase';

      await saveConfirmedReviewItems(items);

      const saved = await db.transactions.toArray();
      expect(saved.length).toBe(1);
      expect(saved[0].amount).toBe(17550); // 175.50 EGP
      expect(saved[0].merchant).toBe('Vasko Clothing Store');
      expect(saved[0].note).toBe('Black t-shirt purchase');
    });

    it('prevents saving duplicate from database', async () => {
      const sms = 'تم استلام 200 EGP من 01015147307 / Mohamed K Eissa معرف 019756663531 13:32 26-05-06';

      // 1. First import
      const firstBatch = await processSmsBatch(sms, testAccounts, testCategories);
      await saveConfirmedReviewItems(firstBatch);
      expect(await db.transactions.count()).toBe(1);

      // 2. Second import of the same SMS
      const secondBatch = await processSmsBatch(sms, testAccounts, testCategories);
      expect(secondBatch[0].isDbDuplicate).toBe(true);
      expect(secondBatch[0].selected).toBe(false); // Unselected by default!

      // If user confirms without explicitly selecting the duplicate, nothing is saved
      const secondResult = await saveConfirmedReviewItems(secondBatch);
      expect(secondResult.savedCount).toBe(0);
      expect(await db.transactions.count()).toBe(1); // Still 1!
    });

    it('defaults unknown category to Uncategorized', async () => {
      // Unknown SMS type or merchant without direct category match
      const sms = 'A debit of 350.00 EGP has been made from card ending 4521 at UnknownShop on 15/05 at 12:30. Available balance: 2500.00';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      expect(items.length).toBe(1);
      const cat = testCategories.find(c => c.id === items[0].categoryId);
      expect(cat).toBeDefined();
    });

    it('does not invent merchant when not present in SMS', async () => {
      // Balance only or recharge without merchant
      const sms = 'شحن 101.50 EGP رصيد 17.35 EGP';
      const items = await processSmsBatch(sms, testAccounts, testCategories);

      expect(items[0].merchant).toBe(''); // Never invent merchant
    });

    it('handles user rejecting (unselecting) specific messages in multi-batch', async () => {
      const sms = `تم استلام 200 EGP من 01015147307 / Mohamed K Eissa معرف 019756663531 13:32 26-05-06
---
تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-05-07 21:37`;

      const items = await processSmsBatch(sms, testAccounts, testCategories);
      expect(items.length).toBe(2);

      // User deselects the first message, accepts only the second
      items[0].selected = false;
      items[1].selected = true;

      const result = await saveConfirmedReviewItems(items);
      expect(result.savedCount).toBe(1); // only 1 transaction saved

      const saved = await db.transactions.toArray();
      expect(saved.some(t => t.referenceId === '019799986433')).toBe(true);
      expect(saved.some(t => t.referenceId === '019756663531')).toBe(false);
    });
  });
});
