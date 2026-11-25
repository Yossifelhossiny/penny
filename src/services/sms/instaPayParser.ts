/**
 * InstaPayParser — Parse InstaPay transfer notifications.
 *
 * Handles Arabic and English InstaPay SMS:
 * - Outgoing transfers (تم تنفيذ تحويل لحظي / InstaPay transfer sent)
 * - Incoming transfers (تم استلام تحويل لحظي / InstaPay transfer received)
 *
 * Example outgoing (Arabic):
 * تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 45.00 جم إلى محمود ا*** ع******** ف**
 * رقم مرجعي 760182550211 يوم 05-09 الساعة 22:21 للمزيد اتصل بـ 19623
 */

import type { ParsedSMS, SmsTransactionType, SmsDirection } from '../../types/sms';
import { amountToPiastres, normalizeArabicNumerals, parseSmsDate, buildFingerprint } from './parserUtils';

export function canParse(text: string): boolean {
  const normalized = normalizeArabicNumerals(text);
  if (/تحويل لحظي|instapay/i.test(normalized)) return true;
  if (/رقم مرجعي/.test(text) && /بمبلغ/.test(normalized)) return true;
  return false;
}

export function parse(text: string): ParsedSMS {
  const normalized = normalizeArabicNumerals(text);
  const warnings: string[] = [];

  // Determine direction
  let transactionType: SmsTransactionType = 'unknown';
  let direction: SmsDirection = null;

  if (/تم تنفيذ تحويل|transfer\s*sent|تحويل.*من\s*بطاقت/i.test(text)) {
    transactionType = 'transfer_out';
    direction = 'outbound';
  } else if (/تم استلام|transfer\s*received|تم استقبال/i.test(text)) {
    transactionType = 'transfer_in';
    direction = 'inbound';
  }

  // Extract amount: "بمبلغ 45.00 جم" or "amount 45.00 EGP"
  let amountPiastres: number | null = null;
  let currency: string | null = null;

  const amountAr = normalized.match(/بمبلغ\s*([\d,]+\.?\d*)\s*(?:جم|جنيه|EGP|ج\.م)/i);
  if (amountAr) {
    amountPiastres = amountToPiastres(amountAr[1]);
    currency = 'EGP';
  }

  if (!amountPiastres) {
    const amountEn = normalized.match(/(?:amount|of)\s*([\d,]+\.?\d*)\s*(?:EGP|جم)/i);
    if (amountEn) {
      amountPiastres = amountToPiastres(amountEn[1]);
      currency = 'EGP';
    }
  }

  // Extract recipient (outgoing) or sender (incoming)
  let recipient: string | null = null;
  let sender: string | null = null;

  if (direction === 'outbound') {
    // "إلى محمود ا*** ع******** ف**"
    const recipientMatch = text.match(/إلى\s+(.+?)(?:\s+رقم|\s+يوم|\s+بتاريخ|\s*$)/);
    if (recipientMatch) {
      recipient = recipientMatch[1].trim();
    }
    if (!recipient) {
      const recipientEn = text.match(/to\s+(.+?)(?:\s+ref|\s+on|\s*$)/i);
      if (recipientEn) recipient = recipientEn[1].trim();
    }
  } else if (direction === 'inbound') {
    // "من محمد ك*** ع****"
    const senderMatch = text.match(/من\s+(.+?)(?:\s+بمبلغ|\s+رقم|\s+يوم|\s*$)/);
    if (senderMatch) {
      sender = senderMatch[1].trim();
      // Don't confuse "من بطاقتكم" (from your card) with a sender name
      if (/بطاقت/.test(sender)) sender = null;
    }
  }

  // Extract reference ID
  let referenceId: string | null = null;
  const refMatch = normalized.match(/(?:رقم مرجعي|مرجعي|ref(?:erence)?(?:\s*#)?)\s*(\d+)/i);
  if (refMatch) {
    referenceId = refMatch[1];
  }

  // Extract card suffix
  let cardSuffix: string | null = null;
  const cardMatch = normalized.match(/(?:رقم|ending|card)\s*(\d{4})/i)
    || normalized.match(/بطاقت[^]*?(\d{4})/);
  if (cardMatch) {
    cardSuffix = cardMatch[1];
  }

  // Extract date and time
  let dateResult = null;

  // "يوم 05-09 الساعة 22:21"
  const dateTimeAr = normalized.match(/يوم\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:الساع[ةه])?\s*(\d{1,2}:\d{2})?/);
  if (dateTimeAr) {
    dateResult = parseSmsDate(dateTimeAr[1], dateTimeAr[2] || undefined);
  }

  if (!dateResult) {
    const dateTimeEn = normalized.match(/(?:on|date)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:at)?\s*(\d{1,2}:\d{2})?/i);
    if (dateTimeEn) {
      dateResult = parseSmsDate(dateTimeEn[1], dateTimeEn[2] || undefined);
    }
  }

  // Balance snapshot if present
  let balanceSnapshotPiastres: number | null = null;
  const balanceMatch = normalized.match(/(?:المتاح|المتبقي|available|balance)[:\s]*([\d,]+\.?\d*)/i);
  if (balanceMatch) {
    balanceSnapshotPiastres = amountToPiastres(balanceMatch[1]);
  }

  // Confidence
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (!amountPiastres) {
    confidence = 'low';
    warnings.push('Could not extract amount');
  }
  if (transactionType === 'unknown') {
    confidence = 'low';
    warnings.push('Could not determine transfer direction');
  }
  if (!referenceId) {
    if (confidence === 'high') confidence = 'medium';
    warnings.push('No reference ID found');
  }
  if (dateResult?.yearMissing) {
    if (confidence === 'high') confidence = 'medium';
    warnings.push('Year is missing from date — will not guess');
  }

  const fingerprint = buildFingerprint({
    source: 'instapay',
    referenceId,
    amountPiastres,
    dateRaw: dateResult?.raw,
    counterparty: recipient || sender,
  });

  return {
    source: 'instapay',
    transactionType,
    direction,
    amountPiastres,
    currency,
    feePiastres: null,
    balanceSnapshotPiastres,
    merchant: null,
    sender,
    recipient,
    phoneNumber: null,
    suggestedAccountType: 'bank',
    cardSuffix,
    referenceId,
    date: dateResult,
    originalText: text,
    fingerprint,
    confidence,
    warnings,
  };
}
