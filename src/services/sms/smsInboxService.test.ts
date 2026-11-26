import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, seedDefaults } from '../../db';
import { computeAccountBalance } from '../transactions';
import {
  importSmsInbox,
  parseInboxFile,
  computeEntryKey,
  getInboxEntries,
  dismissInboxEntry,
  ENTRY_BEGIN,
  ENTRY_END,
} from './smsInboxService';

/** Build one inbox block exactly like the iOS Shortcut writes it. */
function block(text: string, received = '2026-11-25T20:00:00+02:00', sender = 'BANK') {
  return `${ENTRY_BEGIN}\nreceived: ${received}\nsender: ${sender}\n---\n${text}\n${ENTRY_END}\n`;
}

const SMS = {
  bankAr: 'تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA يوم 25/11 الساعه 17:09 المتاح 3313.78 للمزيد إتصل ب 19623',
  bankArCredit: 'تم إضافة 5000.00EGP إلى حسابكم رقم 1234 يوم 25/11 الساعه 09:15 المتاح 8313.78',
  bankEn: 'A debit of EGP 250.00 was made on your card ending 3956 at CARREFOUR MAADI on 25/11 at 14:22. Available balance EGP 3063.78',
  bankEnCredit: 'Your account ending 1234 was credited with EGP 12,500.00 on 25/11/2026. Available balance EGP 15,563.78',
  atm: 'تم سحب 2000.00EGP من بطاقة المدفوعة مقدماً رقم 3956 سحب من الصراف يوم 25/11 الساعه 14:00 المتاح 6313.78',
  ipOutAr: 'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 45.00 جم إلى محمود ا*** ع******** ف** رقم مرجعي 760182550211 يوم 25-11 الساعة 19:21 للمزيد اتصل بـ 19623',
  ipInAr: 'تم استلام تحويل لحظي بمبلغ 1500.00 جم من احمد م*** رقم مرجعي 760182559999 يوم 25-11 الساعة 10:05',
  ipOutEn: 'InstaPay transfer sent: amount 750.00 EGP to MOHAMED A*** ref 881234567890 on 25/11 at 18:40',
  ipInEn: 'InstaPay transfer received: amount 300.00 EGP from SARA K*** ref 881234560001 on 25/11 at 09:12',
  ipNoRef: 'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 80.00 جم إلى كريم م*** يوم 25-11 الساعة 13:00',
  vfOut: 'تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-11-25 21:37',
  vfIn: 'تم استلام مبلغ 200 جنيه من رقم 01015147307 المسجل بإسم Mohamed K Eissa معرف 019756663531 26-11-25 13:32',
  vfDeposit: 'تم إيداع 500 جنيه في محفظة فودافون كاش الخاصة بك. رصيدك الحالي 1700 جنيه. رقم العملية 019811112222 26-11-25 18:05',
  vfWithdraw: 'تم سحب 300 جنيه من محفظة فودافون كاش الخاصة بك رسوم 3 جنيه. رصيدك الحالي 1397 جنيه. رقم العملية 019811113333 26-11-25 19:10',
  vfDepositEn: 'You have deposited 500 EGP to your Vodafone Cash wallet. Your balance is 1700 EGP. Transaction ID 019811114444 26-11-25 18:05',
  vfWithdrawEn: 'You have withdrawn 300 EGP from your Vodafone Cash wallet. Fee 3 EGP. Your balance is 1397 EGP. Transaction ID 019811115555 26-11-25 19:10',
  otp: 'رمز التحقق الخاص بك هو 482913 لا تشاركه مع أحد',
  promo: 'خصم 30% على كل المشتريات من كارفور حتى نهاية الشهر!',
  personal: 'Hey are we still meeting at 8?',
  balance: 'رصيد بطاقة رقم 3956 المتاح 3313.78 EGP',
};

async function balances() {
  const accs = await db.accounts.toArray();
  const out: Record<string, number> = {};
  for (const a of accs) out[a.type] = (await computeAccountBalance(a.id!)) / 100;
  return out;
}

describe('smsInboxService — iOS Shortcut auto-import', () => {
  beforeEach(async () => {
    await Promise.all([
      db.accounts.clear(), db.transactions.clear(), db.categories.clear(),
      db.budgets.clear(), db.goals.clear(), db.smsInbox.clear(),
    ]);
    await seedDefaults();
    // Opening balances: Bank 10,000 / Vodafone 2,000 / Cash 500
    for (const a of await db.accounts.toArray()) {
      const opening = a.type === 'bank' ? 10_000_00 : a.type === 'vodafone_cash' ? 2_000_00 : 500_00;
      await db.accounts.update(a.id!, { openingBalance: opening });
    }
  });

  describe('parseInboxFile', () => {
    it('reads received time, sender and multi-line body', () => {
      const file = block('line one\nline two', '2026-11-25T20:00:00+02:00', 'CIB') + block('second');
      const entries = parseInboxFile(file);
      expect(entries).toHaveLength(2);
      expect(entries[0].text).toBe('line one\nline two');
      expect(entries[0].sender).toBe('CIB');
      expect(entries[0].receivedAt?.toISOString()).toBe('2026-11-25T18:00:00.000Z');
    });

    it('accepts Arabic-Indic digits in the received time and CRLF line endings', () => {
      const file = block('x', '٢٠٢٦-١١-٢٥T٢٠:٠٠:٠٠+02:00').replace(/\n/g, '\r\n');
      expect(parseInboxFile(file)[0].receivedAt?.toISOString()).toBe('2026-11-25T18:00:00.000Z');
    });

    it('treats text without markers as plain pasted SMS', () => {
      const entries = parseInboxFile(`${SMS.bankAr}\n\n${SMS.vfIn}`);
      expect(entries).toHaveLength(2);
      expect(entries[0].receivedAt).toBeNull();
    });

    it('gives the same key for the same SMS regardless of whitespace', () => {
      const a = parseInboxFile(block(SMS.bankAr))[0];
      const b = parseInboxFile(block(`  ${SMS.bankAr.replace(/ /g, '  ')}  `))[0];
      expect(computeEntryKey(a)).toBe(computeEntryKey(b));
    });
  });

  it('auto-saves every supported SMS type and updates balances exactly', async () => {
    const supported = [
      SMS.bankAr, SMS.bankArCredit, SMS.bankEn, SMS.bankEnCredit, SMS.atm,
      SMS.ipOutAr, SMS.ipInAr, SMS.ipOutEn, SMS.ipInEn,
      SMS.vfOut, SMS.vfIn, SMS.vfDeposit, SMS.vfWithdraw,
    ];
    const summary = await importSmsInbox(supported.map((t) => block(t, '2026-11-25T22:00:00+02:00')).join(''));

    const notSaved = summary.results.filter((r) => r.status !== 'saved');
    expect(notSaved).toEqual([]);
    expect(summary.saved).toBe(13);

    // Bank:   10000 −160 +5000 −250 +12500 −2000 −45 +1500 −750 +300 = 26095
    // Vodafone: 2000 −600 −1 (fee) +200 +500 −300 −3 (fee)            = 1796
    // Cash:      500 +2000 (ATM) −500 (deposit) +300 (withdrawal)      = 2300
    expect(await balances()).toEqual({ bank: 26095, vodafone_cash: 1796, cash: 2300 });

    // Original SMS text is preserved on every transaction
    const txns = await db.transactions.toArray();
    expect(txns.every((t) => !!t.originalSms)).toBe(true);
    expect(txns).toHaveLength(15); // 13 + 2 separate fee expenses
  });

  it('maps wallet cash-in/out to transfers between Cash Wallet and Vodafone Cash', async () => {
    await importSmsInbox(block(SMS.vfDepositEn, '2026-11-25T18:10:00+02:00') + block(SMS.vfWithdrawEn, '2026-11-25T19:15:00+02:00'));
    const txns = await db.transactions.toArray();
    const accs = await db.accounts.toArray();
    const id = (t: string) => accs.find((a) => a.type === t)!.id;
    const deposit = txns.find((t) => t.referenceId === '019811114444')!;
    const withdraw = txns.find((t) => t.referenceId === '019811115555')!;
    expect(deposit).toMatchObject({ type: 'transfer', accountId: id('cash'), toAccountId: id('vodafone_cash'), amount: 50000 });
    expect(withdraw).toMatchObject({ type: 'transfer', accountId: id('vodafone_cash'), toAccountId: id('cash'), amount: 30000 });
    const fee = txns.find((t) => t.referenceId === '019811115555-fee')!;
    expect(fee).toMatchObject({ type: 'expense', amount: 300, accountId: id('vodafone_cash') });
  });

  it('records the fee as a separate expense on the paying account', async () => {
    await importSmsInbox(block(SMS.vfOut, '2026-11-25T21:38:00+02:00'));
    const txns = await db.transactions.toArray();
    expect(txns.map((t) => [t.type, t.amount])).toEqual([['expense', 60000], ['expense', 100]]);
    expect((await balances()).vodafone_cash).toBe(1399);
  });

  it('ignores unsupported and non-financial messages without creating transactions', async () => {
    const summary = await importSmsInbox(
      [SMS.otp, SMS.promo, SMS.personal, SMS.balance].map((t) => block(t)).join('')
    );
    expect(summary.ignored).toBe(4);
    expect(await db.transactions.count()).toBe(0);
    // …but the original text is still kept in the inbox log
    const ignored = await getInboxEntries('ignored');
    expect(ignored.map((e) => e.text)).toContain(SMS.otp);
  });

  it('repeated Shortcut runs and repeated syncs never duplicate transactions', async () => {
    const file = block(SMS.bankAr, '2026-11-25T17:10:00+02:00') + block(SMS.vfOut, '2026-11-25T21:38:00+02:00');

    const first = await importSmsInbox(file);
    expect(first.saved).toBe(2);

    // Same file synced again (e.g. tapped Sync twice)
    const second = await importSmsInbox(file);
    expect(second.alreadyProcessed).toBe(2);
    expect(second.saved).toBe(0);

    // The automation fired twice for the same SMS (different receive second)
    const third = await importSmsInbox(
      block(SMS.bankAr, '2026-11-25T17:10:05+02:00') + block(SMS.vfOut, '2026-11-25T21:38:09+02:00')
    );
    expect(third.duplicates).toBe(2);
    expect(third.saved).toBe(0);

    expect(await db.transactions.count()).toBe(3); // 2 + Vodafone fee
    expect(await balances()).toEqual({ bank: 9840, vodafone_cash: 1399, cash: 500 });
  });

  it('two syncs running at the same time still save each SMS once', async () => {
    const file = block(SMS.ipInAr, '2026-11-25T10:06:00+02:00');
    const [a, b] = await Promise.all([importSmsInbox(file), importSmsInbox(file)]);
    expect(a.saved + b.saved).toBe(1);
    expect(await db.transactions.count()).toBe(1);
  });

  it('saves InstaPay without a reference when everything else is clear, and never twice', async () => {
    const s1 = await importSmsInbox(block(SMS.ipNoRef, '2026-11-25T13:01:00+02:00'));
    expect(s1.saved).toBe(1);
    const s2 = await importSmsInbox(block(SMS.ipNoRef, '2026-11-25T13:01:30+02:00'));
    expect(s2.duplicates).toBe(1); // same SMS (has date+time) → strong duplicate
    expect(await db.transactions.count()).toBe(1);
  });

  it('saves two different same-amount purchases on the same day (different times)', async () => {
    await importSmsInbox(block(SMS.bankAr, '2026-11-25T17:10:00+02:00'));
    const other = SMS.bankAr.replace('PAYMOB-*vasko egypt TA', 'TALABAT').replace('17:09', '20:30');
    const s = await importSmsInbox(block(other, '2026-11-25T20:31:00+02:00'));
    expect(s.saved).toBe(1);
    expect(await db.transactions.count()).toBe(2);
  });

  it('sends an SMS to pending when you already logged the same amount by hand that day', async () => {
    const bank = (await db.accounts.toArray()).find((a) => a.type === 'bank')!;
    const cat = (await db.categories.toArray()).find((c) => c.name === 'Shopping')!;
    await db.transactions.add({
      amount: 16000, type: 'expense', accountId: bank.id!, categoryId: cat.id,
      date: new Date('2026-11-25T17:00:00+02:00'), createdAt: new Date(),
    });
    const s = await importSmsInbox(block(SMS.bankAr, '2026-11-25T17:10:00+02:00'));
    expect(s.pending).toBe(1);
    expect(s.results[0].reason).toMatch(/duplicate/i);
    expect(await db.transactions.count()).toBe(1);
  });

  it('uses the receive time to fill a missing year, including across New Year', async () => {
    const dec31 = SMS.bankAr.replace('25/11', '31/12').replace('17:09', '23:50');
    const s = await importSmsInbox(block(dec31, '2027-01-01T00:05:00+02:00'));
    expect(s.saved).toBe(1);
    const t = (await db.transactions.toArray())[0];
    expect([t.date.getFullYear(), t.date.getMonth(), t.date.getDate()]).toEqual([2026, 11, 31]);
  });

  it('sends ambiguous dates (far from the receive time) to pending', async () => {
    // "05-09" could be 5 Sep or 9 May — neither is near 25 Nov
    const odd = SMS.ipOutAr.replace('25-11', '05-09');
    const s = await importSmsInbox(block(odd, '2026-11-25T20:00:00+02:00'));
    expect(s.pending).toBe(1);
    expect(s.results[0].reason).toMatch(/far from when it arrived/);
    expect(await db.transactions.count()).toBe(0);
  });

  it('keeps an SMS with a missing year pending when there is no receive time', async () => {
    const s = await importSmsInbox(SMS.bankAr); // pasted, no Shortcut header
    expect(s.pending).toBe(1);
    expect(await db.transactions.count()).toBe(0);
  });

  it('sends recognised-but-incomplete SMS to pending (never saves invalid data)', async () => {
    const noAmount = 'تم تحويل مبلغ إلى 01002006618 معرف 019799986433 26-11-25 21:37';
    const s = await importSmsInbox(block(noAmount));
    expect(s.pending).toBe(1);
    expect(await db.transactions.count()).toBe(0);
    const pending = await getInboxEntries('pending');
    expect(pending[0].text).toBe(noAmount);
  });

  it('lets the user dismiss a pending entry', async () => {
    await importSmsInbox(SMS.bankAr);
    const [p] = await getInboxEntries('pending');
    await dismissInboxEntry(p.id!);
    expect(await getInboxEntries('pending')).toHaveLength(0);
    expect((await db.smsInbox.get(p.id!))!.status).toBe('dismissed');
  });

  it('uses the receive time when the SMS has no date at all', async () => {
    const noDate = 'تم خصم 99.00EGP من بطاقة رقم 3956 عند UBER';
    const s = await importSmsInbox(block(noDate, '2026-11-25T08:30:00+02:00'));
    expect(s.saved).toBe(1);
    const t = (await db.transactions.toArray())[0];
    expect(t.date.toISOString()).toBe('2026-11-25T06:30:00.000Z');
  });
});
