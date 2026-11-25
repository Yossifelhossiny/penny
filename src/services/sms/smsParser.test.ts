/**
 * Comprehensive SMS Parser Tests
 *
 * Tests all three parsers + the unified service:
 * - GenericBankParser (Arabic/English card SMS)
 * - InstaPayParser (transfer notifications)
 * - VodafoneCashParser (transfers, recharges, balance)
 * - SmsParserService (routing, dedup)
 */

import { describe, it, expect } from 'vitest';
import { parseSms, detectSource, isDuplicate, findDuplicateIndices } from './smsParserService';
import * as genericBankParser from './genericBankParser';
import * as instaPayParser from './instaPayParser';
import * as vodafoneCashParser from './vodafoneCashParser';

// =========================================================
// Test fixtures
// =========================================================

const FIXTURES = {
  // Generic bank: Arabic card debit at merchant
  bankDebitArabic:
    'تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA يوم 09/05 الساعه 17:09 المتاح 3313.78 للمزيد إتصل ب 19623',

  // Generic bank: credit (money received)
  bankCreditArabic:
    'تم إضافة 5000.00EGP إلى بطاقة المدفوعة مقدماً رقم 3956 يوم 10/05 الساعه 09:30 المتاح 8313.78 للمزيد إتصل ب 19623',

  // Generic bank: ATM withdrawal
  bankAtmArabic:
    'تم سحب 2000.00EGP من بطاقة المدفوعة مقدماً رقم 3956 سحب من الصراف يوم 11/05 الساعه 14:00 المتاح 6313.78 للمزيد إتصل ب 19623',

  // Generic bank: English debit
  bankDebitEnglish:
    'A debit of 350.00 EGP has been made from card ending 4521 at Carrefour Maadi on 15/05 at 12:30. Available balance: 2500.00',

  // InstaPay: Arabic outgoing
  instaPayOutArabic:
    'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 45.00 جم إلى محمود ا*** ع******** ف** رقم مرجعي 760182550211 يوم 05-09 الساعة 22:21 للمزيد اتصل بـ 19623',

  // InstaPay: Arabic incoming
  instaPayInArabic:
    'تم استلام تحويل لحظي بمبلغ 1200.00 جم من أحمد م*** على بطاقتكم رقم مرجعي 890223445566 يوم 06-09 الساعة 10:15',

  // Vodafone Cash: outgoing transfer with fee
  vodafoneOut:
    'تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-05-07 21:37',

  // Vodafone Cash: incoming transfer with sender name
  vodafoneIn:
    'تم استلام 200 EGP من 01015147307 / Mohamed K Eissa معرف 019756663531 13:32 26-05-06',

  // Vodafone Cash: mobile recharge with balance
  vodafoneRecharge:
    'شحن 101.50 EGP رصيد 17.35 EGP',

  // Balance-only notification
  bankBalanceOnly:
    'رصيد بطاقة رقم 3956 المتاح 5000.00 EGP',

  // Unknown SMS
  unknownSms:
    'عميلنا العزيز، نرجو تحديث بياناتك في أقرب فرع',
};


// =========================================================
// Source Detection
// =========================================================

describe('SMS Source Detection', () => {
  it('detects generic bank SMS', () => {
    expect(detectSource(FIXTURES.bankDebitArabic)).toBe('generic_bank');
    expect(detectSource(FIXTURES.bankCreditArabic)).toBe('generic_bank');
    expect(detectSource(FIXTURES.bankAtmArabic)).toBe('generic_bank');
    expect(detectSource(FIXTURES.bankDebitEnglish)).toBe('generic_bank');
  });

  it('detects InstaPay SMS', () => {
    expect(detectSource(FIXTURES.instaPayOutArabic)).toBe('instapay');
    expect(detectSource(FIXTURES.instaPayInArabic)).toBe('instapay');
  });

  it('detects Vodafone Cash SMS', () => {
    expect(detectSource(FIXTURES.vodafoneOut)).toBe('vodafone_cash');
    expect(detectSource(FIXTURES.vodafoneIn)).toBe('vodafone_cash');
    expect(detectSource(FIXTURES.vodafoneRecharge)).toBe('vodafone_cash');
  });

  it('returns unknown for unrecognized SMS', () => {
    expect(detectSource(FIXTURES.unknownSms)).toBe('unknown');
    expect(detectSource('Hello world')).toBe('unknown');
    expect(detectSource('')).toBe('unknown');
  });
});


// =========================================================
// Generic Bank Parser
// =========================================================

describe('GenericBankParser', () => {
  describe('Arabic card debit (fixture)', () => {
    it('parses card purchase correctly', () => {
      const result = parseSms(FIXTURES.bankDebitArabic);

      expect(result.source).toBe('generic_bank');
      expect(result.transactionType).toBe('card_purchase');
      expect(result.direction).toBe('outbound');
      expect(result.amountPiastres).toBe(16000); // 160.00 EGP
      expect(result.currency).toBe('EGP');
      expect(result.cardSuffix).toBe('3956');
      expect(result.merchant).toBe('PAYMOB-*vasko egypt');
      expect(result.balanceSnapshotPiastres).toBe(331378); // 3313.78 EGP
      expect(result.originalText).toBe(FIXTURES.bankDebitArabic);
    });

    it('extracts date without year', () => {
      const result = parseSms(FIXTURES.bankDebitArabic);

      expect(result.date).not.toBeNull();
      expect(result.date!.yearMissing).toBe(true);
      expect(result.date!.parsed).toBeNull(); // We NEVER guess year
      expect(result.date!.raw).toContain('09/05');
    });

    it('balance snapshot is NOT income or expense', () => {
      const result = parseSms(FIXTURES.bankDebitArabic);
      // The main transaction is card_purchase, the balance is just a snapshot
      expect(result.transactionType).toBe('card_purchase');
      expect(result.balanceSnapshotPiastres).toBe(331378);
    });
  });

  describe('Arabic card credit', () => {
    it('parses credit correctly', () => {
      const result = parseSms(FIXTURES.bankCreditArabic);

      expect(result.transactionType).toBe('income');
      expect(result.direction).toBe('inbound');
      expect(result.amountPiastres).toBe(500000); // 5000.00 EGP
      expect(result.cardSuffix).toBe('3956');
    });
  });

  describe('ATM withdrawal', () => {
    it('parses ATM as atm_withdrawal, not expense', () => {
      const result = parseSms(FIXTURES.bankAtmArabic);

      expect(result.transactionType).toBe('atm_withdrawal');
      expect(result.direction).toBe('outbound');
      expect(result.amountPiastres).toBe(200000); // 2000.00 EGP
      // ATM withdrawal is a transfer Bank→Cash, NOT an immediate expense
    });
  });

  describe('English card debit', () => {
    it('parses English format', () => {
      const result = parseSms(FIXTURES.bankDebitEnglish);

      expect(result.source).toBe('generic_bank');
      expect(result.transactionType).toBe('card_purchase');
      expect(result.direction).toBe('outbound');
      expect(result.amountPiastres).toBe(35000); // 350.00 EGP
      expect(result.cardSuffix).toBe('4521');
      expect(result.balanceSnapshotPiastres).toBe(250000);
    });
  });

  describe('Balance-only notification', () => {
    it('detects balance-only as not a transaction', () => {
      const result = parseSms(FIXTURES.bankBalanceOnly);

      expect(result.source).toBe('generic_bank');
      expect(result.transactionType).toBe('balance_only');
      expect(result.direction).toBeNull();
      expect(result.amountPiastres).toBeNull();
      expect(result.balanceSnapshotPiastres).toBe(500000);
    });
  });

  describe('Integer piastres rule', () => {
    it('converts amounts to exact integer piastres', () => {
      const result = parseSms(FIXTURES.bankDebitArabic);
      expect(Number.isInteger(result.amountPiastres)).toBe(true);
      expect(Number.isInteger(result.balanceSnapshotPiastres)).toBe(true);
    });
  });
});


// =========================================================
// InstaPay Parser
// =========================================================

describe('InstaPayParser', () => {
  describe('Outgoing transfer (fixture)', () => {
    it('parses outgoing transfer correctly', () => {
      const result = parseSms(FIXTURES.instaPayOutArabic);

      expect(result.source).toBe('instapay');
      expect(result.transactionType).toBe('transfer_out');
      expect(result.direction).toBe('outbound');
      expect(result.amountPiastres).toBe(4500); // 45.00 جم
      expect(result.currency).toBe('EGP');
      expect(result.referenceId).toBe('760182550211');
      expect(result.recipient).toContain('محمود');
    });

    it('transfer is NOT an expense', () => {
      const result = parseSms(FIXTURES.instaPayOutArabic);
      expect(result.transactionType).toBe('transfer_out');
      expect(result.transactionType).not.toBe('expense');
    });

    it('extracts date without year', () => {
      const result = parseSms(FIXTURES.instaPayOutArabic);
      expect(result.date).not.toBeNull();
      expect(result.date!.yearMissing).toBe(true);
      expect(result.date!.parsed).toBeNull();
    });
  });

  describe('Incoming transfer', () => {
    it('parses incoming transfer correctly', () => {
      const result = parseSms(FIXTURES.instaPayInArabic);

      expect(result.source).toBe('instapay');
      expect(result.transactionType).toBe('transfer_in');
      expect(result.direction).toBe('inbound');
      expect(result.amountPiastres).toBe(120000); // 1200.00 جم
      expect(result.referenceId).toBe('890223445566');
    });
  });

  describe('Reference ID dedup', () => {
    it('uses reference ID in fingerprint for dedup', () => {
      const result = parseSms(FIXTURES.instaPayOutArabic);
      expect(result.fingerprint).toContain('760182550211');
      expect(result.fingerprint).toContain('ref');
    });
  });
});


// =========================================================
// Vodafone Cash Parser
// =========================================================

describe('VodafoneCashParser', () => {
  describe('Outgoing transfer with fee (fixture)', () => {
    it('parses amount and fee separately', () => {
      const result = parseSms(FIXTURES.vodafoneOut);

      expect(result.source).toBe('vodafone_cash');
      expect(result.transactionType).toBe('transfer_out');
      expect(result.direction).toBe('outbound');
      expect(result.amountPiastres).toBe(60000); // 600 EGP
      expect(result.feePiastres).toBe(100); // 1 EGP fee
      expect(result.referenceId).toBe('019799986433');
      expect(result.suggestedAccountType).toBe('vodafone_cash');
    });

    it('fee is separate from transferred amount', () => {
      const result = parseSms(FIXTURES.vodafoneOut);
      // Fee must NOT be added to the amount
      expect(result.amountPiastres).toBe(60000);
      expect(result.feePiastres).toBe(100);
      expect(result.amountPiastres! + result.feePiastres!).toBe(60100);
    });

    it('extracts recipient phone', () => {
      const result = parseSms(FIXTURES.vodafoneOut);
      expect(result.phoneNumber).toBe('01002006618');
    });

    it('parses YY-MM-DD date format with year', () => {
      const result = parseSms(FIXTURES.vodafoneOut);
      expect(result.date).not.toBeNull();
      expect(result.date!.yearMissing).toBe(false);
      expect(result.date!.parsed).not.toBeNull();
      const d = result.date!.parsed!;
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(4); // May (0-indexed)
      expect(d.getDate()).toBe(7);
      expect(d.getHours()).toBe(21);
      expect(d.getMinutes()).toBe(37);
    });
  });

  describe('Incoming transfer with sender name (fixture)', () => {
    it('parses incoming transfer correctly', () => {
      const result = parseSms(FIXTURES.vodafoneIn);

      expect(result.source).toBe('vodafone_cash');
      expect(result.transactionType).toBe('transfer_in');
      expect(result.direction).toBe('inbound');
      expect(result.amountPiastres).toBe(20000); // 200 EGP
      expect(result.referenceId).toBe('019756663531');
      expect(result.sender).toContain('01015147307');
      expect(result.sender).toContain('Mohamed K Eissa');
    });

    it('parses time-first date format', () => {
      const result = parseSms(FIXTURES.vodafoneIn);
      expect(result.date).not.toBeNull();
      expect(result.date!.yearMissing).toBe(false);
      expect(result.date!.parsed).not.toBeNull();
      const d = result.date!.parsed!;
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(4); // May
      expect(d.getDate()).toBe(6);
      expect(d.getHours()).toBe(13);
      expect(d.getMinutes()).toBe(32);
    });
  });

  describe('Mobile recharge with balance snapshot (fixture)', () => {
    it('parses recharge correctly', () => {
      const result = parseSms(FIXTURES.vodafoneRecharge);

      expect(result.source).toBe('vodafone_cash');
      expect(result.transactionType).toBe('mobile_recharge');
      expect(result.direction).toBe('outbound');
      expect(result.amountPiastres).toBe(10150); // 101.50 EGP
      expect(result.balanceSnapshotPiastres).toBe(1735); // 17.35 EGP
    });

    it('balance snapshot is NOT income', () => {
      const result = parseSms(FIXTURES.vodafoneRecharge);
      expect(result.transactionType).toBe('mobile_recharge');
      // The balance is informational, not a transaction
      expect(result.balanceSnapshotPiastres).toBe(1735);
    });
  });

  describe('Integer piastres', () => {
    it('all money values are integers', () => {
      const result = parseSms(FIXTURES.vodafoneOut);
      expect(Number.isInteger(result.amountPiastres)).toBe(true);
      expect(Number.isInteger(result.feePiastres)).toBe(true);

      const recharge = parseSms(FIXTURES.vodafoneRecharge);
      expect(Number.isInteger(recharge.amountPiastres)).toBe(true);
      expect(Number.isInteger(recharge.balanceSnapshotPiastres)).toBe(true);
    });
  });
});


// =========================================================
// SMS Parser Service (routing + dedup)
// =========================================================

describe('SmsParserService', () => {
  describe('Unified parse routing', () => {
    it('routes bank SMS to genericBankParser', () => {
      const result = parseSms(FIXTURES.bankDebitArabic);
      expect(result.source).toBe('generic_bank');
    });

    it('routes InstaPay SMS to instaPayParser', () => {
      const result = parseSms(FIXTURES.instaPayOutArabic);
      expect(result.source).toBe('instapay');
    });

    it('routes Vodafone Cash SMS to vodafoneCashParser', () => {
      const result = parseSms(FIXTURES.vodafoneOut);
      expect(result.source).toBe('vodafone_cash');
    });

    it('returns unknown for unrecognized SMS', () => {
      const result = parseSms(FIXTURES.unknownSms);
      expect(result.source).toBe('unknown');
      expect(result.transactionType).toBe('unknown');
      expect(result.confidence).toBe('low');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Original text preservation', () => {
    it('preserves original SMS text verbatim in all parsers', () => {
      expect(parseSms(FIXTURES.bankDebitArabic).originalText).toBe(FIXTURES.bankDebitArabic);
      expect(parseSms(FIXTURES.instaPayOutArabic).originalText).toBe(FIXTURES.instaPayOutArabic);
      expect(parseSms(FIXTURES.vodafoneOut).originalText).toBe(FIXTURES.vodafoneOut);
      expect(parseSms(FIXTURES.unknownSms).originalText).toBe(FIXTURES.unknownSms);
    });
  });

  describe('Duplicate detection', () => {
    it('detects duplicates by reference ID', () => {
      const a = parseSms(FIXTURES.instaPayOutArabic);
      const b = parseSms(FIXTURES.instaPayOutArabic);
      expect(isDuplicate(a, b)).toBe(true);
    });

    it('does not flag different transactions as duplicates', () => {
      const a = parseSms(FIXTURES.instaPayOutArabic);
      const b = parseSms(FIXTURES.instaPayInArabic);
      expect(isDuplicate(a, b)).toBe(false);
    });

    it('detects duplicates by fallback fingerprint when no ref ID', () => {
      const a = parseSms(FIXTURES.bankDebitArabic);
      const b = parseSms(FIXTURES.bankDebitArabic);
      expect(isDuplicate(a, b)).toBe(true);
    });

    it('findDuplicateIndices returns correct indices', () => {
      const results = [
        parseSms(FIXTURES.bankDebitArabic),
        parseSms(FIXTURES.instaPayOutArabic),
        parseSms(FIXTURES.bankDebitArabic), // duplicate of index 0
        parseSms(FIXTURES.vodafoneOut),
        parseSms(FIXTURES.instaPayOutArabic), // duplicate of index 1
      ];

      const dupes = findDuplicateIndices(results);
      expect(dupes.has(0)).toBe(false);
      expect(dupes.has(1)).toBe(false);
      expect(dupes.has(2)).toBe(true); // dupe of 0
      expect(dupes.has(3)).toBe(false);
      expect(dupes.has(4)).toBe(true); // dupe of 1
    });
  });

  describe('Never guess missing data', () => {
    it('does not invent a year when missing', () => {
      const result = parseSms(FIXTURES.bankDebitArabic);
      expect(result.date!.yearMissing).toBe(true);
      expect(result.date!.parsed).toBeNull();
    });

    it('does not guess direction for unknown SMS', () => {
      const result = parseSms(FIXTURES.unknownSms);
      expect(result.direction).toBeNull();
    });

    it('unknown merchant stays null, not "Uncategorized"', () => {
      // Vodafone transfers have no merchant
      const result = parseSms(FIXTURES.vodafoneOut);
      expect(result.merchant).toBeNull();
    });
  });

  describe('Parser does NOT save to DB', () => {
    it('parseSms returns a plain object, no DB side effects', () => {
      const result = parseSms(FIXTURES.bankDebitArabic);
      // Result is a plain ParsedSMS, no DB references
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('fingerprint');
      expect(result).not.toHaveProperty('id'); // Not a DB record
    });
  });
});


// =========================================================
// Edge cases
// =========================================================

describe('Edge Cases', () => {
  it('handles empty string', () => {
    const result = parseSms('');
    expect(result.source).toBe('unknown');
    expect(result.confidence).toBe('low');
  });

  it('handles whitespace-only string', () => {
    const result = parseSms('   \n\t  ');
    expect(result.source).toBe('unknown');
  });

  it('handles amount with comma separators', () => {
    const sms = 'تم خصم 1,234.56EGP من بطاقة المدفوعة مقدماً رقم 1234 يوم 01/01 الساعه 10:00 المتاح 10,000.00';
    const result = parseSms(sms);
    expect(result.amountPiastres).toBe(123456); // 1,234.56 → 123456 piastres
    expect(result.balanceSnapshotPiastres).toBe(1000000); // 10,000.00
  });

  it('handles amount without decimals', () => {
    const sms = 'تم تحويل 600 EGP إلى 01002006618 معرف 019799986433 26-05-07 21:37';
    const result = parseSms(sms);
    expect(result.amountPiastres).toBe(60000); // 600 → 60000 piastres
  });

  it('preserves Arabic text in merchant name', () => {
    const result = parseSms(FIXTURES.bankDebitArabic);
    expect(result.merchant).toContain('PAYMOB');
  });

  it('suggested account types are correct per parser', () => {
    expect(parseSms(FIXTURES.bankDebitArabic).suggestedAccountType).toBe('bank');
    expect(parseSms(FIXTURES.instaPayOutArabic).suggestedAccountType).toBe('bank');
    expect(parseSms(FIXTURES.vodafoneOut).suggestedAccountType).toBe('vodafone_cash');
  });

  it('ATM withdrawal is transfer Bank→Cash, not expense', () => {
    const result = parseSms(FIXTURES.bankAtmArabic);
    expect(result.transactionType).toBe('atm_withdrawal');
    // The UI layer would map this to a transfer from bank to cash wallet
    expect(result.transactionType).not.toBe('expense');
  });
});


// =========================================================
// Parser-level canParse tests
// =========================================================

describe('canParse routing', () => {
  it('genericBankParser identifies its own SMS', () => {
    expect(genericBankParser.canParse(FIXTURES.bankDebitArabic)).toBe(true);
    expect(genericBankParser.canParse(FIXTURES.bankDebitEnglish)).toBe(true);
    expect(genericBankParser.canParse(FIXTURES.vodafoneOut)).toBe(false);
  });

  it('instaPayParser identifies its own SMS', () => {
    expect(instaPayParser.canParse(FIXTURES.instaPayOutArabic)).toBe(true);
    expect(instaPayParser.canParse(FIXTURES.instaPayInArabic)).toBe(true);
    expect(instaPayParser.canParse(FIXTURES.bankDebitArabic)).toBe(false);
  });

  it('vodafoneCashParser identifies its own SMS', () => {
    expect(vodafoneCashParser.canParse(FIXTURES.vodafoneOut)).toBe(true);
    expect(vodafoneCashParser.canParse(FIXTURES.vodafoneIn)).toBe(true);
    expect(vodafoneCashParser.canParse(FIXTURES.vodafoneRecharge)).toBe(true);
    expect(vodafoneCashParser.canParse(FIXTURES.bankDebitArabic)).toBe(false);
  });
});
