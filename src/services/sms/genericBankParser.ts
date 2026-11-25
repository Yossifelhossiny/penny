/**
 * GenericBankParser — Parse Egyptian bank card SMS notifications.
 *
 * Handles Arabic and English formats:
 * - Card debits (تم خصم / debited)
 * - Card credits (تم إضافة / credited)
 * - ATM withdrawals (سحب من الصراف / ATM withdrawal)
 * - Balance notifications
 *
 * Example Arabic:
 * تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA
 * يوم 09/05 الساعه 17:09 المتاح 3313.78 للمزيد إتصل ب 19623
 */

import type { ParsedSMS, SmsTransactionType, SmsDirection } from '../../types/sms';
import { amountToPiastres, normalizeArabicNumerals, parseSmsDate, buildFingerprint } from './parserUtils';

export function canParse(text: string): boolean {
  const normalized = normalizeArabicNumerals(text);
  // Arabic bank SMS patterns
  if (/تم خصم|تم إضافة|تم اضافة|سحب من|تم سحب/.test(text)) return true;
  if (/بطاقة|بطاقت/.test(text) && /EGP|جم|جنيه/.test(normalized)) return true;
  // English bank SMS patterns
  if (/debit|credit|withdraw/i.test(normalized) && /EGP|card/i.test(normalized)) return true;
  // Balance-only with card reference
  if (/المتاح|available|balance/i.test(normalized) && /بطاقة|card/i.test(normalized)) return true;
  return false;
}

export function parse(text: string): ParsedSMS {
  const normalized = normalizeArabicNumerals(text);
  const warnings: string[] = [];

  // Determine transaction type and direction
  let transactionType: SmsTransactionType = 'unknown';
  let direction: SmsDirection = null;

  // ATM withdrawal
  if (/سحب من الصراف|سحب من ماكينة|ATM withdraw/i.test(text)) {
    transactionType = 'atm_withdrawal';
    direction = 'outbound';
  }
  // Card debit / خصم
  else if (/تم خصم|debit/i.test(text)) {
    transactionType = 'card_purchase';
    direction = 'outbound';
  }
  // Card credit / إضافة
  else if (/تم إضافة|تم اضافة|credit/i.test(text)) {
    transactionType = 'income';
    direction = 'inbound';
  }
  // ATM general
  else if (/تم سحب|withdraw/i.test(text)) {
    transactionType = 'atm_withdrawal';
    direction = 'outbound';
  }

  // Extract amount
  let amountPiastres: number | null = null;
  let currency: string | null = null;

  // Pattern: "خصم 160.00EGP" or "إضافة 5000.00EGP" — amount preceded by a transaction verb
  // Must NOT match amounts after balance keywords (المتاح, رصيد, available, balance)
  const amountVerb = normalized.match(/(?:خصم|إضافة|اضافة|سحب|debit|credit|withdraw)[^\d]*([\d,]+\.?\d*)\s*(?:EGP|جم|جنيه|ج\.م)/i);
  if (amountVerb) {
    amountPiastres = amountToPiastres(amountVerb[1]);
    currency = 'EGP';
  }

  // Pattern: "بمبلغ 45.00 جم" (amount with currency after)
  if (!amountPiastres) {
    const amountAr = normalized.match(/بمبلغ\s*([\d,]+\.?\d*)\s*(?:جم|جنيه|EGP|ج\.م)/i);
    if (amountAr) {
      amountPiastres = amountToPiastres(amountAr[1]);
      currency = 'EGP';
    }
  }

  // Generic fallback: find all "NNN.NN EGP" matches, skip ones preceded by balance keywords
  if (!amountPiastres) {
    const allAmounts = [...normalized.matchAll(/([\d,]+\.?\d*)\s*(?:EGP|جم|جنيه|ج\.م)/gi)];
    for (const m of allAmounts) {
      // Check text before this match for balance keywords
      const before = normalized.slice(Math.max(0, m.index! - 30), m.index!);
      if (/(?:المتاح|المتبقي|رصيد|available|balance)\s*$/i.test(before)) continue;
      amountPiastres = amountToPiastres(m[1]);
      currency = 'EGP';
      break;
    }
  }

  // Extract card suffix (last 4 digits)
  let cardSuffix: string | null = null;
  const cardMatch = normalized.match(/(?:رقم|ending|card\s*#?)\s*(\d{4})/i)
    || normalized.match(/بطاقة[^]*?(\d{4})/);
  if (cardMatch) {
    cardSuffix = cardMatch[1];
  }

  // Extract merchant
  let merchant: string | null = null;
  // Arabic: "عند MERCHANT" or "لدى MERCHANT"
  const merchantAr = text.match(/(?:عند|لدى|at)\s+(.+?)(?:\s+يوم|\s+بتاريخ|\s+في|\s*$)/i);
  if (merchantAr) {
    merchant = merchantAr[1].trim();
    // Clean trailing whitespace and common suffixes
    merchant = merchant.replace(/\s+TA$/i, '').trim();
    if (merchant.length === 0) merchant = null;
  }

  // Extract date and time
  let dateResult = null;
  // Arabic: "يوم 09/05 الساعه 17:09" or "يوم 09/05 الساعة 17:09"
  const dateTimeAr = normalized.match(/يوم\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:الساع[ةه]|الوقت)?\s*(\d{1,2}:\d{2})?/);
  if (dateTimeAr) {
    dateResult = parseSmsDate(dateTimeAr[1], dateTimeAr[2] || undefined);
  }

  // English: "on 09/05 at 17:09"
  if (!dateResult) {
    const dateTimeEn = normalized.match(/(?:on|date)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:at)?\s*(\d{1,2}:\d{2})?/i);
    if (dateTimeEn) {
      dateResult = parseSmsDate(dateTimeEn[1], dateTimeEn[2] || undefined);
    }
  }

  // Extract balance snapshot
  let balanceSnapshotPiastres: number | null = null;
  const balanceMatch = normalized.match(/(?:المتاح|المتبقي|available|balance)[:\s]*([\d,]+\.?\d*)/i);
  if (balanceMatch) {
    balanceSnapshotPiastres = amountToPiastres(balanceMatch[1]);
  }

  // If we only have a balance and no amount, it's balance_only
  if (!amountPiastres && balanceSnapshotPiastres !== null) {
    transactionType = 'balance_only';
    direction = null;
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (!amountPiastres && transactionType !== 'balance_only') {
    confidence = 'low';
    warnings.push('Could not extract amount');
  }
  if (!dateResult) {
    if (confidence === 'high') confidence = 'medium';
    warnings.push('Could not extract date');
  } else if (dateResult.yearMissing) {
    if (confidence === 'high') confidence = 'medium';
    warnings.push('Year is missing from date — will not guess');
  }

  const fingerprint = buildFingerprint({
    source: 'generic_bank',
    amountPiastres,
    dateRaw: dateResult?.raw,
    counterparty: merchant || cardSuffix,
  });

  return {
    source: 'generic_bank',
    transactionType,
    direction,
    amountPiastres,
    currency,
    feePiastres: null,
    balanceSnapshotPiastres,
    merchant,
    sender: null,
    recipient: null,
    phoneNumber: null,
    suggestedAccountType: 'bank',
    cardSuffix,
    referenceId: null,
    date: dateResult,
    originalText: text,
    fingerprint,
    confidence,
    warnings,
  };
}
