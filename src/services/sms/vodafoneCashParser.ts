/**
 * VodafoneCashParser — Parse Vodafone Cash SMS notifications.
 *
 * Handles:
 * - Outgoing transfers (تم تحويل / You sent)
 *   e.g. 600 EGP + 1 EGP fee, recipient 01002006618, ID 019799986433
 * - Incoming transfers (تم استلام / You received)
 *   e.g. 200 EGP from 01015147307 / Mohamed K Eissa, ID 019756663531
 * - Mobile recharges (شحن / recharge)
 *   e.g. 101.50 EGP recharge, balance 17.35 EGP
 * - Balance notifications
 *
 * Vodafone Cash uses YY-MM-DD date format (e.g. 26-05-07).
 */

import type { ParsedSMS, SmsTransactionType, SmsDirection } from '../../types/sms';
import { amountToPiastres, normalizeArabicNumerals, parseSmsDate, buildFingerprint } from './parserUtils';

export function canParse(text: string): boolean {
  const normalized = normalizeArabicNumerals(text);
  if (/vodafone\s*cash|فودافون\s*كاش/i.test(normalized)) return true;
  // Vodafone Cash transaction ID pattern (long numeric)
  if (/\b01\d{10}\b/.test(normalized) && /تم تحويل|تم استلام|شحن|recharge|transfer/i.test(text)) return true;
  // Specific Vodafone patterns
  if (/رسوم|fee/i.test(normalized) && /تحويل|transfer/i.test(normalized) && /01\d{10}/.test(normalized)) return true;
  // Mobile recharge with balance — distinctive Vodafone Cash pattern
  if (/(?:شحن|recharge)/i.test(text) && /(?:رصيد|balance)/i.test(normalized) && /EGP|جم|جنيه/i.test(normalized)) return true;
  return false;
}

export function parse(text: string): ParsedSMS {
  const normalized = normalizeArabicNumerals(text);
  const warnings: string[] = [];

  let transactionType: SmsTransactionType = 'unknown';
  let direction: SmsDirection = null;
  let amountPiastres: number | null = null;
  let feePiastres: number | null = null;
  let currency: string | null = null;
  let phoneNumber: string | null = null;
  let sender: string | null = null;
  let recipient: string | null = null;
  let referenceId: string | null = null;
  let balanceSnapshotPiastres: number | null = null;

  // === Determine type ===

  // Recharge
  if (/شحن|recharge/i.test(text)) {
    transactionType = 'mobile_recharge';
    direction = 'outbound';
  }
  // Outgoing transfer
  else if (/تم تحويل|(?:you|تم)\s*(?:sent|ارسال|أرسل)/i.test(text)) {
    transactionType = 'transfer_out';
    direction = 'outbound';
  }
  // Incoming transfer
  else if (/تم استلام|(?:you|تم)\s*(?:received|استقبال)/i.test(text)) {
    transactionType = 'transfer_in';
    direction = 'inbound';
  }

  // === Extract amount ===

  // Try multiple patterns for amount
  // "600 EGP" or "600.00 EGP" or "بمبلغ 600 جم"
  const amountPatterns = [
    /([\d,]+\.?\d*)\s*(?:EGP|جم|جنيه|ج\.م)/i,
    /بمبلغ\s*([\d,]+\.?\d*)/i,
    /amount[:\s]*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      amountPiastres = amountToPiastres(match[1]);
      currency = 'EGP';
      break;
    }
  }

  // === Extract fee ===
  // "رسوم 1 جم" or "fee 1 EGP" or "رسوم التحويل 1.00 جم"
  const feeMatch = normalized.match(/(?:رسوم|fee|عمول[ةه])[^]*?([\d,]+\.?\d*)\s*(?:EGP|جم|جنيه|ج\.م)?/i);
  if (feeMatch) {
    feePiastres = amountToPiastres(feeMatch[1]);
  }

  // === Extract phone number ===
  // Egyptian mobile: 01XXXXXXXXX (11 digits starting with 01)
  const phoneMatch = normalized.match(/\b(01\d{9})\b/);
  if (phoneMatch) {
    phoneNumber = phoneMatch[1];
  }

  // === Extract sender/recipient name ===
  if (direction === 'outbound') {
    // The phone number is the recipient
    if (phoneNumber) recipient = phoneNumber;
    // Look for name after phone number: "01002006618 / Name" or "01002006618 اسم"
    const nameAfterPhone = text.match(/01\d{9}\s*[/-]\s*(.+?)(?:\s*(?:رقم|ID|معرف)|$)/);
    if (nameAfterPhone) {
      recipient = `${phoneNumber} / ${nameAfterPhone[1].trim()}`;
    }
  } else if (direction === 'inbound') {
    // "من 01015147307 / Mohamed K Eissa"
    const senderMatch = text.match(/(?:من|from)\s*(01\d{9})(?:\s*[/-]\s*(.+?))?(?:\s*(?:رقم|ID|معرف|بمبلغ)|$)/i);
    if (senderMatch) {
      phoneNumber = senderMatch[1];
      if (senderMatch[2]) {
        sender = `${senderMatch[1]} / ${senderMatch[2].trim()}`;
      } else {
        sender = senderMatch[1];
      }
    }
  }

  // === Extract transaction/reference ID ===
  // Vodafone Cash IDs: "ID 019799986433" or "معرف 019799986433" or "رقم العمليه 019799986433"
  const idMatch = normalized.match(/(?:ID|معرف|رقم العملي[ةه]|transaction)\s*[:#]?\s*(\d{10,})/i);
  if (idMatch) {
    referenceId = idMatch[1];
  }

  // === Extract date/time ===
  let dateResult = null;

  // Vodafone uses YY-MM-DD format: "26-05-07 21:37"
  const vodaDateMatch = normalized.match(/(\d{2}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
  if (vodaDateMatch) {
    dateResult = parseSmsDate(vodaDateMatch[1], vodaDateMatch[2], 'yy-mm-dd');
  }

  // Also try HH:MM YY-MM-DD (time first): "13:32 26-05-06"
  if (!dateResult) {
    const timeFirst = normalized.match(/(\d{1,2}:\d{2})\s+(\d{2}-\d{2}-\d{2})/);
    if (timeFirst) {
      dateResult = parseSmsDate(timeFirst[2], timeFirst[1], 'yy-mm-dd');
    }
  }

  // Fallback to generic date patterns
  if (!dateResult) {
    const genericDate = normalized.match(/(?:يوم|on|date)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:الساع[ةه])?\s*(\d{1,2}:\d{2})?/i);
    if (genericDate) {
      dateResult = parseSmsDate(genericDate[1], genericDate[2] || undefined);
    }
  }

  // === Extract balance snapshot ===
  const balanceMatch = normalized.match(/(?:رصيد|balance|المتاح|المتبقي)[:\s]*([\d,]+\.?\d*)\s*(?:EGP|جم|جنيه|ج\.م)?/i);
  if (balanceMatch) {
    balanceSnapshotPiastres = amountToPiastres(balanceMatch[1]);
  }

  // If only balance and no amount, it's balance_only
  if (!amountPiastres && balanceSnapshotPiastres !== null && transactionType === 'unknown') {
    transactionType = 'balance_only';
    direction = null;
  }

  // === Confidence ===
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (!amountPiastres && transactionType !== 'balance_only') {
    confidence = 'low';
    warnings.push('Could not extract amount');
  }
  if (transactionType === 'unknown') {
    confidence = 'low';
    warnings.push('Could not determine transaction type');
  }
  if (!referenceId) {
    if (confidence === 'high') confidence = 'medium';
    warnings.push('No transaction ID found');
  }
  if (dateResult?.yearMissing) {
    if (confidence === 'high') confidence = 'medium';
    warnings.push('Year is missing from date — will not guess');
  }

  const fingerprint = buildFingerprint({
    source: 'vodafone_cash',
    referenceId,
    amountPiastres,
    dateRaw: dateResult?.raw,
    counterparty: recipient || sender || phoneNumber,
  });

  return {
    source: 'vodafone_cash',
    transactionType,
    direction,
    amountPiastres,
    currency,
    feePiastres,
    balanceSnapshotPiastres,
    merchant: null,
    sender,
    recipient,
    phoneNumber,
    suggestedAccountType: 'vodafone_cash',
    cardSuffix: null,
    referenceId,
    date: dateResult,
    originalText: text,
    fingerprint,
    confidence,
    warnings,
  };
}
