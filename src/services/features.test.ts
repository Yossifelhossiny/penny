import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, seedDefaults } from '../db';
import { matchCategory, normalizeKey, learnCategory, getRules, applyCategoryToMatching } from './categoryRules';
import { findOrCreatePerson, getPeopleSummaries, looksLikePersonName } from './people';
import { createDebt, addRepayment, settleDebt, getDebtTotals, debtOutstanding } from './debts';
import { saveRecurringIncome, runRecurringIncome, setRecurringEnabled, defaultStartMonth } from './recurring';
import { getBudgetPlan, getAdvice, estimateMonthlyIncome } from './advice';
import { importSmsEntries } from './sms/smsInboxService';
import { setBudget } from './budgets';
import { generateBackupData, validateBackupData, restoreBackupData } from './backup';

const IN_AHMED = 'تم إضافة تحويل لحظي بمبلغ 500.00 جم من AHMED M****** إلى بطاقتكم مسبقة الدفع رقم مرجعي 287630550001 يوم 26-11 الساعة 14:10';
const IN_AHMED_2 = 'تم إضافة تحويل لحظي بمبلغ 300.00 جم من AHMED M****** إلى بطاقتكم مسبقة الدفع رقم مرجعي 287630550009 يوم 27-11 الساعة 10:00';
const OUT_MOHAB = 'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 45.00 جم إلى MOHAB E****** رقم مرجعي 287630553600 يوم 26-11 الساعة 15:00';
const CARD_TALABAT = 'تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند TALABAT EGYPT يوم 26/11 الساعه 13:09 المتاح 3313.78';

async function reset() {
  await Promise.all(db.tables.map((t) => t.clear()));
  await seedDefaults();
  const bank = (await db.accounts.toArray()).find((a) => a.type === 'bank')!;
  await db.accounts.update(bank.id!, { openingBalance: 10_000_00 });
  return bank.id!;
}
const cat = async (name: string, type: 'income' | 'expense' = 'expense') =>
  (await db.categories.toArray()).find((c) => c.name === name && c.type === type)!;
const entry = (text: string, at: string) => ({ receivedAt: new Date(at), sender: 'BanK-AlAhly', text });

describe('Rent category', () => {
  beforeEach(reset);
  it('exists by default', async () => {
    expect(await cat('Rent')).toBeTruthy();
  });
});

describe('category rules', () => {
  beforeEach(reset);

  it('normalises names so masked / Arabic variants match', () => {
    expect(normalizeKey('AHMED M******')).toBe('ahmed m');
    expect(normalizeKey('PAYMOB-*vasko egypt TA 123')).toBe('paymob vasko egypt ta');
    expect(normalizeKey('إيجار')).toBe(normalizeKey('ايجار'));
  });

  it('built-in merchants are categorised; user rules win', async () => {
    const cats = await db.categories.toArray();
    const food = await cat('Food & Drinks');
    const shopping = await cat('Shopping');
    expect(matchCategory('TALABAT EGYPT', 'expense', [], cats)?.categoryId).toBe(food.id);
    expect(matchCategory('Uber *Trip', 'expense', [], cats)?.categoryId).toBe((await cat('Transportation')).id);
    expect(matchCategory('Metro Market Zamalek', 'expense', [], cats)?.categoryId).toBe(food.id); // longest keyword
    await learnCategory('TALABAT EGYPT', 'expense', shopping.id!);
    expect(matchCategory('TALABAT EGYPT', 'expense', await getRules(), cats)).toEqual({ categoryId: shopping.id, source: 'user' });
  });

  it('never learns Uncategorized', async () => {
    await learnCategory('X', 'expense', (await cat('Uncategorized')).id!);
    expect(await getRules()).toHaveLength(0);
  });

  it('an SMS from a taught person is filed automatically, and Penny names the person', async () => {
    const freelance = await cat('Freelance', 'income');
    await importSmsEntries([entry(IN_AHMED, '2026-11-26T14:11:00+02:00')]);
    const first = (await db.transactions.toArray())[0];
    expect((await db.categories.get(first.categoryId!))!.name).toBe('Uncategorized');
    expect(first.personId).toBeTruthy();

    // You tell Penny that money from Ahmed is Freelance…
    await learnCategory('AHMED M******', 'income', freelance.id!);
    expect(await applyCategoryToMatching('AHMED M******', 'income', freelance.id!)).toBe(1);

    // …so the next one goes straight there.
    const s = await importSmsEntries([entry(IN_AHMED_2, '2026-11-27T10:01:00+02:00')]);
    expect(s.results[0]).toMatchObject({ status: 'saved', personName: 'AHMED M******', categoryName: 'Freelance' });
    const all = await db.transactions.toArray();
    expect(all.every((t) => t.categoryId === freelance.id)).toBe(true);
    expect(new Set(all.map((t) => t.personId)).size).toBe(1);
  });

  it('known merchants from card SMS are filed automatically', async () => {
    await importSmsEntries([entry(CARD_TALABAT, '2026-11-26T13:10:00+02:00')]);
    const t = (await db.transactions.toArray())[0];
    expect((await db.categories.get(t.categoryId!))!.name).toBe('Food & Drinks');
  });
});

describe('people', () => {
  beforeEach(reset);

  it('creates one person per name and summarises money in/out', async () => {
    await importSmsEntries([entry(IN_AHMED, '2026-11-26T14:11:00+02:00'), entry(IN_AHMED_2, '2026-11-27T10:01:00+02:00'), entry(OUT_MOHAB, '2026-11-26T15:01:00+02:00')]);
    const people = await getPeopleSummaries();
    expect(people.map((p) => p.person.name).sort()).toEqual(['AHMED M******', 'MOHAB E******']);
    const ahmed = people.find((p) => p.person.name.startsWith('AHMED'))!;
    expect(ahmed).toMatchObject({ receivedPiastres: 800_00, sentPiastres: 0, transactionCount: 2, uncategorizedCount: 2 });
    const mohab = people.find((p) => p.person.name.startsWith('MOHAB'))!;
    expect(mohab.sentPiastres).toBe(45_00);
  });

  it('ignores card / account wording and phone-only names get a stable key', async () => {
    expect(looksLikePersonName('بطاقتكم')).toBe(false);
    expect(looksLikePersonName('01002006618')).toBe(false);
    const a = await findOrCreatePerson('01002006618');
    const b = await findOrCreatePerson('01002006618');
    expect(a).toBe(b);
  });
});

describe('debts', () => {
  beforeEach(reset);

  it('tracks lent / borrowed, repayments and overdue', async () => {
    const lent = await createDebt({ personName: 'Karim', direction: 'lent', amountPiastres: 1000_00, reason: 'Laptop repair', date: new Date(2026, 10, 1), dueDate: new Date(2026, 10, 20) });
    await createDebt({ personName: 'Karim', direction: 'borrowed', amountPiastres: 300_00, date: new Date(2026, 10, 5) });
    await addRepayment(lent, 400_00, new Date(2026, 10, 10));
    await expect(addRepayment(lent, 700_00, new Date())).rejects.toThrow();

    const totals = await getDebtTotals(new Date(2026, 10, 26));
    expect(totals).toMatchObject({ owedToYouPiastres: 600_00, youOwePiastres: 300_00 });
    expect(totals.overdue).toHaveLength(1);

    const karim = (await getPeopleSummaries()).find((p) => p.person.name === 'Karim')!;
    expect(karim.debtBalancePiastres).toBe(300_00); // they owe 600, you owe 300

    await settleDebt(lent);
    const d = (await db.debts.get(lent))!;
    expect(d.status).toBe('settled');
    expect(debtOutstanding(d)).toBe(0);
  });

  it('does not change account balances', async () => {
    await createDebt({ personName: 'Sara', direction: 'lent', amountPiastres: 500_00, date: new Date() });
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('monthly income', () => {
  let bankId: number;
  beforeEach(async () => {
    bankId = await reset();
  });

  it('adds income on the 1st, once per month, and catches up missed months', async () => {
    const salary = await cat('Salary', 'income');
    const id = await saveRecurringIncome({ name: 'Salary', amountPiastres: 28_000_00, accountId: bankId, categoryId: salary.id!, dayOfMonth: 1, enabled: true, startMonth: '2026-09' });
    // Not opened since August → September, October and November are filled in.
    const created = await runRecurringIncome(new Date(2026, 10, 26, 12));
    expect(created).toHaveLength(3);
    expect(await runRecurringIncome(new Date(2026, 10, 26, 13))).toHaveLength(0); // idempotent
    const dates = (await db.transactions.toArray()).map((t) => t.date.getMonth());
    expect(dates.sort((x, y) => x - y)).toEqual([8, 9, 10]);

    // Two runs at the same time still create one entry.
    const [a, b] = await Promise.all([runRecurringIncome(new Date(2026, 11, 1, 10)), runRecurringIncome(new Date(2026, 11, 1, 10))]);
    expect(a.length + b.length).toBe(1);

    // Turned off → nothing; turned back on later → no back-fill of the off months.
    await setRecurringEnabled(id, false);
    expect(await runRecurringIncome(new Date(2027, 1, 15))).toHaveLength(0);
    await setRecurringEnabled(id, true, new Date(2027, 1, 15));
    expect(await runRecurringIncome(new Date(2027, 1, 15))).toHaveLength(0); // Feb's 1st already passed → starts March
    expect(await runRecurringIncome(new Date(2027, 2, 1, 10))).toHaveLength(1);
  });

  it('default start month skips the current month once its day has passed', () => {
    expect(defaultStartMonth(1, new Date(2026, 10, 26))).toBe('2026-12');
    expect(defaultStartMonth(28, new Date(2026, 10, 26))).toBe('2026-11');
  });

  it('sets the expected income used by budgets', async () => {
    const salary = await cat('Salary', 'income');
    await saveRecurringIncome({ name: 'Salary', amountPiastres: 20_000_00, accountId: bankId, categoryId: salary.id!, dayOfMonth: 1, enabled: true, startMonth: '2026-12' });
    expect(await estimateMonthlyIncome()).toEqual({ monthlyPiastres: 20_000_00, source: 'recurring' });
  });
});

describe('budget plan and warnings', () => {
  let bankId: number;
  beforeEach(async () => {
    bankId = await reset();
    const salary = await cat('Salary', 'income');
    await saveRecurringIncome({ name: 'Salary', amountPiastres: 20_000_00, accountId: bankId, categoryId: salary.id!, dayOfMonth: 1, enabled: true, startMonth: '2026-12' });
  });

  it('adds up category budgets and says what you’ll save', async () => {
    await setBudget({ categoryId: (await cat('Food & Drinks')).id!, limitPiastres: 6_000_00 });
    await setBudget({ categoryId: (await cat('Rent')).id!, limitPiastres: 8_000_00 });
    const plan = await getBudgetPlan(2026, 10, new Date(2026, 10, 26));
    expect(plan).toMatchObject({ plannedSpendingPiastres: 14_000_00, categoryLimitsPiastres: 14_000_00, plannedSavingsPiastres: 6_000_00, verdict: 'on-target' });
    expect(plan.savingsRate).toBe(30);

    await setBudget({ categoryId: (await cat('Shopping')).id!, limitPiastres: 4_000_00 });
    const tight = await getBudgetPlan(2026, 10, new Date(2026, 10, 26));
    expect(tight).toMatchObject({ verdict: 'below-target', trimToTargetPiastres: 2_000_00 });

    await setBudget({ categoryId: 0, limitPiastres: 25_000_00 });
    expect((await getBudgetPlan(2026, 10, new Date(2026, 10, 26))).verdict).toBe('over-income');
  });

  it('warns about deficit, low emergency fund, overdue debts and missing backup', async () => {
    const food = await cat('Food & Drinks');
    const add = (type: 'income' | 'expense', egp: number, d: Date, categoryId: number) =>
      db.transactions.add({ type, amount: egp * 100, accountId: bankId, categoryId, date: d, createdAt: d });
    const salary = await cat('Salary', 'income');
    await add('income', 5000, new Date(2026, 9, 1), salary.id!);
    await add('expense', 4800, new Date(2026, 9, 10), food.id!);
    await add('income', 2000, new Date(2026, 10, 1), salary.id!);
    await add('expense', 9000, new Date(2026, 10, 10), food.id!);
    await db.accounts.update(bankId, { openingBalance: 0 });
    await createDebt({ personName: 'Omar', direction: 'borrowed', amountPiastres: 1000_00, date: new Date(2026, 9, 1), dueDate: new Date(2026, 10, 1) });

    const ids = (await getAdvice({ now: new Date(2026, 10, 26), storagePersisted: false })).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['deficit', 'savings-rate', 'emergency', 'needs', 'backup', 'persist']));
    expect(ids.some((i) => i.startsWith('debt-'))).toBe(true);
    // High severity first
    expect((await getAdvice({ now: new Date(2026, 10, 26) }))[0].severity).toBe('high');
  });
});

describe('backups include the new data', () => {
  beforeEach(reset);
  it('round-trips people, debts, rules and recurring income', async () => {
    await createDebt({ personName: 'Mona', direction: 'lent', amountPiastres: 100_00, date: new Date(2026, 10, 1), dueDate: new Date(2026, 11, 1) });
    await learnCategory('Noon', 'expense', (await cat('Shopping')).id!);
    const salary = await cat('Salary', 'income');
    await saveRecurringIncome({ name: 'Salary', amountPiastres: 1, accountId: 1, categoryId: salary.id!, dayOfMonth: 1, enabled: false, startMonth: '2026-12' });
    const json = JSON.parse(JSON.stringify(await generateBackupData()));
    await Promise.all([db.people.clear(), db.debts.clear(), db.categoryRules.clear(), db.recurring.clear()]);
    const v = validateBackupData(json);
    expect(v.valid).toBe(true);
    await restoreBackupData(v.data!, 'overwrite');
    expect(await db.people.count()).toBe(1);
    expect((await db.debts.toArray())[0].dueDate).toBeInstanceOf(Date);
    expect(await db.categoryRules.count()).toBe(1);
    expect(await db.recurring.count()).toBe(1);
  });
});
