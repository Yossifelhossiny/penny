import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, seedDefaults } from '../../db';
import { computeAccountBalance } from '../transactions';
import { parseSms } from './smsParserService';
import { resolveYearlessDate, stripBidiMarks } from './parserUtils';
import {
  importSmsInbox,
  importSmsEntries,
  countUncategorizedTransactions,
  ENTRY_BEGIN,
  ENTRY_END,
} from './smsInboxService';

const RLM = '‏';
function block(text: string, received = '2026-11-26T15:00:12+02:00', sender = 'BanK-AlAhly') {
  return `${ENTRY_BEGIN}\nreceived: ${received}\nsender: ${sender}\n---\n${text}\n${ENTRY_END}\n`;
}

// The real outgoing SMS from the screenshot, with the numbers stored the way
// RTL-composed SMS often are: logically "11-26", shown on screen as "26-11".
const OUT_REAL = `تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 5.00 جم إلى MOHAB E****** رقم مرجعي 287630553655 يوم 11${RLM}-${RLM}26 الساعة 14:59 للمزيد اتصل بـ 19623`;
const OUT_SWAPPED = 'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 5.00 جم إلى MOHAB E****** رقم مرجعي 287630553656 يوم 11-26 الساعة 14:59';

const IN_VARIANTS = [
  'تم إضافة تحويل لحظي بمبلغ 500.00 جم من AHMED M****** إلى بطاقتكم مسبقة الدفع رقم مرجعي 287630550001 يوم 26-11 الساعة 14:10 للمزيد اتصل بـ 19623',
  'تم اضافة تحويل لحظي إلى بطاقتكم مسبقة الدفع بمبلغ 250.00 جم من SARA K***** رقم مرجعي 287630550002 يوم 26-11 الساعة 13:00',
  'تمت إضافة تحويل لحظي لحسابكم بمبلغ 75.50 جم من KARIM M*** رقم مرجعي 287630550003 يوم 26-11 الساعة 12:00',
  'تم اضافه تحويل لحظي من MONA A**** بمبلغ 1000 جم رقم مرجعي 287630550004 يوم 26-11 الساعة 11:00',
];

describe('date fixes', () => {
  it('strips invisible bidi marks', () => {
    expect(stripBidiMarks(`11${RLM}-${RLM}26`)).toBe('11-26');
  });

  it('resolves DD-MM and swapped MM-DD to the date closest to arrival', () => {
    const arrived = new Date(2026, 10, 26, 15, 0);
    expect(resolveYearlessDate('26-11 14:59', arrived)).toEqual(new Date(2026, 10, 26, 14, 59));
    expect(resolveYearlessDate('11-26 14:59', arrived)).toEqual(new Date(2026, 10, 26, 14, 59));
    // New Year: SMS from 31 Dec arriving on 1 Jan belongs to last year
    expect(resolveYearlessDate('31/12 23:50', new Date(2027, 0, 1, 0, 5))).toEqual(new Date(2026, 11, 31, 23, 50));
    // Ambiguous dates are always day-month — never swapped just because it's closer
    expect(resolveYearlessDate('09/05 17:09', arrived)).toEqual(new Date(2026, 4, 9, 17, 9));
    expect(resolveYearlessDate('03-04', new Date(2026, 3, 3, 15))).toEqual(new Date(2026, 3, 3, 12, 0));
    expect(resolveYearlessDate('99-99', arrived)).toBeNull();
  });
});

describe('incoming InstaPay', () => {
  it.each(IN_VARIANTS)('treats "%s" as money in', (sms) => {
    const p = parseSms(sms);
    expect(p.source).toBe('instapay');
    expect(p.transactionType).toBe('transfer_in');
    expect(p.direction).toBe('inbound');
    expect(p.sender).toMatch(/^[A-Z]+ [A-Z]\*+$/);
  });

  it('keeps outgoing InstaPay as money out', () => {
    for (const sms of [OUT_REAL, OUT_SWAPPED]) {
      const p = parseSms(sms);
      expect(p.transactionType).toBe('transfer_out');
      expect(p.recipient).toBe('MOHAB E******');
    }
  });
});

describe('automatic saving', () => {
  beforeEach(async () => {
    await Promise.all([
      db.accounts.clear(), db.transactions.clear(), db.categories.clear(),
      db.budgets.clear(), db.goals.clear(), db.smsInbox.clear(),
    ]);
    await seedDefaults();
    for (const a of await db.accounts.toArray()) {
      await db.accounts.update(a.id!, { openingBalance: a.type === 'bank' ? 10_000_00 : 0 });
    }
  });

  const bank = async () => {
    const acc = (await db.accounts.toArray()).find(a => a.type === 'bank')!;
    return (await computeAccountBalance(acc.id!)) / 100;
  };

  it('saves the screenshot SMS on the right date instead of sending it to review', async () => {
    const s = await importSmsInbox(block(OUT_REAL));
    expect(s.saved).toBe(1);
    const t = (await db.transactions.toArray())[0];
    expect(t.type).toBe('expense');
    expect(t.date).toEqual(new Date(2026, 10, 26, 14, 59));
    expect(await bank()).toBe(9995);
  });

  it('adds incoming InstaPay to the balance, uncategorized', async () => {
    const s = await importSmsInbox(block(IN_VARIANTS[0]));
    expect(s.saved).toBe(1);
    const t = (await db.transactions.toArray())[0];
    expect(t.type).toBe('income');
    const cat = await db.categories.get(t.categoryId!);
    expect(cat).toMatchObject({ name: 'Uncategorized', type: 'income' });
    expect(await bank()).toBe(10_500);
  });

  it('counts uncategorized transactions for the notification', async () => {
    await importSmsEntries([
      { receivedAt: new Date('2026-11-26T15:00:00+02:00'), sender: 'BanK-AlAhly', text: IN_VARIANTS[0] },
      { receivedAt: new Date('2026-11-26T15:01:00+02:00'), sender: 'BanK-AlAhly', text: OUT_REAL },
    ]);
    expect(await countUncategorizedTransactions()).toBe(2);
    expect(await bank()).toBe(10_495);
  });

  it('the same pushed SMS twice is saved once', async () => {
    const e = { receivedAt: new Date('2026-11-26T15:00:00+02:00'), sender: 'X', text: IN_VARIANTS[1] };
    const a = await importSmsEntries([e]);
    const b = await importSmsEntries([e]);
    expect(a.saved).toBe(1);
    expect(b.alreadyProcessed).toBe(1);
    expect(await db.transactions.count()).toBe(1);
  });
});
