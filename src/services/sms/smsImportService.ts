/**
 * SMS Import Service
 *
 * Coordinates parsing, batch splitting, duplicate detection,
 * review model preparation, and final confirmation saving.
 *
 * All operations are local-first with zero external dependencies.
 */

import { db } from '../../db';
import type { Account, Category } from '../../types';
import type { ParsedSMS } from '../../types/sms';
import { parseSms, findDuplicateIndices } from './smsParserService';
import { addIncome, addExpense, addTransfer } from '../transactions';

export interface SmsReviewItem {
  id: string; // unique ID for React list keys
  parsed: ParsedSMS;

  // Selection state
  selected: boolean;

  // Editable fields
  action: 'income' | 'expense' | 'transfer' | 'ignore';
  amountEgp: string;
  accountId: number;
  toAccountId?: number; // for transfers
  categoryId?: number; // for income/expense
  merchant: string;
  note: string;

  // Date resolution
  dateStr: string; // YYYY-MM-DDTHH:mm
  dateUnresolved: boolean;
  dateWarning?: string;

  // Fee handling
  hasFee: boolean;
  feeEgp: string;
  includeFeeAsExpense: boolean;
  feeCategoryId?: number;

  // Duplicate detection
  isBatchDuplicate: boolean;
  batchDuplicateOfIndex?: number;
  isDbDuplicate: boolean;
  dbDuplicateReason?: string;

  // Balance-only / informational
  isBalanceOnly: boolean;

  // Validation
  validationError?: string;
}

/**
 * Split raw pasted text into individual SMS messages.
 * Supports:
 * - Empty line separators (double newlines)
 * - Custom divider lines (---, ===, ___, ***)
 * - Message boundary detection for consecutive messages
 */
export function splitSmsMessages(rawText: string): string[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // Check for divider lines like "---" or "==="
  if (/\r?\n\s*[-=_*~]{3,}\s*\r?\n/.test(trimmed)) {
    return trimmed
      .split(/\r?\n\s*[-=_*~]{3,}\s*\r?\n/)
      .map(m => m.trim())
      .filter(m => m.length > 0);
  }

  // Check for blank line separators (2 or more newlines)
  if (/\r?\n\s*\r?\n/.test(trimmed)) {
    return trimmed
      .split(/\r?\n\s*\r?\n+/)
      .map(m => m.trim())
      .filter(m => m.length > 0);
  }

  // Check for multiple SMS messages without blank lines, separated by known Egyptian bank / SMS headers
  const headerPattern = /(?:^|\r?\n)(?=(?:تم خصم|تم إضافة|تم اضافة|تم سحب|سحب من|تم تحويل|تم استلام|تم تنفيذ تحويل|شحن |رصيد بطاقة|A debit of|A credit of|A withdrawal of))/i;
  const segments = trimmed.split(headerPattern);
  const cleanSegments = segments.map(s => s.trim()).filter(s => s.length > 0);

  if (cleanSegments.length > 1) {
    return cleanSegments;
  }

  // Single message
  return [trimmed];
}

/**
 * Format a Date to local ISO string suitable for `<input type="datetime-local">` (YYYY-MM-DDTHH:mm).
 */
export function toInputDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Try to resolve a raw date string into a Date using a specified fallback year.
 * Egyptian SMS dates: DD/MM or DD-MM.
 */
export function resolveDateWithYear(rawDateStr: string, fallbackYear: number): Date {
  const normalized = rawDateStr.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660));

  let hours = 12;
  let minutes = 0;
  const timeMatch = normalized.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
  }

  // Check DD/MM or DD-MM
  const matchSlash = normalized.match(/(\d{1,2})[/-](\d{1,2})/);
  if (matchSlash) {
    const day = parseInt(matchSlash[1], 10);
    const month = parseInt(matchSlash[2], 10) - 1;
    return new Date(fallbackYear, month, day, hours, minutes);
  }

  return new Date();
}

/**
 * Check if a parsed SMS matches any transaction already saved in the database.
 */
export interface DbDuplicateResult {
  isDuplicate: boolean;
  reason?: string;
  existingTxnId?: number;
  /**
   * 'strong' = same reference ID, or same fingerprint that includes a date+time
   * or reference (safe to ignore automatically).
   * 'weak' = only same amount on the same day, or a fingerprint without a
   * date/time (could be a genuine second transaction — needs a human).
   */
  strength?: 'strong' | 'weak';
}

/** True when a fingerprint is specific enough to identify one transaction. */
export function isStrongFingerprint(parsed: ParsedSMS): boolean {
  if (parsed.referenceId) return true;
  return !!parsed.date && /\d{1,2}:\d{2}/.test(parsed.date.raw);
}

export async function checkDatabaseDuplicate(
  parsed: ParsedSMS
): Promise<DbDuplicateResult> {
  // 1. Check by reference ID
  if (parsed.referenceId) {
    const byRef = await db.transactions
      .where('referenceId')
      .equals(parsed.referenceId)
      .first();

    if (byRef) {
      return {
        isDuplicate: true,
        reason: `Matches existing transaction with Reference ID: ${parsed.referenceId}`,
        existingTxnId: byRef.id,
        strength: 'strong',
      };
    }

    // Also check if note contains the reference ID
    const byNote = await db.transactions
      .filter(t => !!t.note && t.note.includes(parsed.referenceId!))
      .first();

    if (byNote) {
      return {
        isDuplicate: true,
        reason: `Reference ID ${parsed.referenceId} found in transaction history`,
        existingTxnId: byNote.id,
        strength: 'strong',
      };
    }
  }

  // 2. Check by exact SMS fingerprint
  if (parsed.fingerprint) {
    const byFp = await db.transactions
      .where('smsFingerprint')
      .equals(parsed.fingerprint)
      .first();

    if (byFp) {
      return {
        isDuplicate: true,
        reason: 'Identical SMS has already been imported',
        existingTxnId: byFp.id,
        strength: isStrongFingerprint(parsed) ? 'strong' : 'weak',
      };
    }
  }

  // 3. Fallback: match by amount and same calendar day
  if (parsed.amountPiastres && parsed.date?.parsed) {
    const targetDate = parsed.date.parsed;
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    const parsedIsStrong = isStrongFingerprint(parsed);
    const matches = await db.transactions
      .where('date')
      .between(startOfDay, endOfDay, true, true)
      .filter(t => {
        if (t.amount !== parsed.amountPiastres) return false;
        // Provably different transactions are not duplicates:
        // different reference IDs…
        if (parsed.referenceId && t.referenceId && t.referenceId !== parsed.referenceId) return false;
        // …or two precise SMS fingerprints (with reference or exact time) that differ.
        if (
          parsedIsStrong &&
          t.smsFingerprint &&
          t.smsFingerprint !== parsed.fingerprint &&
          (t.smsFingerprint.includes(':ref:') || /\d{1,2}:\d{2}/.test(t.smsFingerprint))
        ) return false;
        return true;
      })
      .toArray();

    if (matches.length > 0) {
      return {
        isDuplicate: true,
        reason: `Potential duplicate: Same amount (${(parsed.amountPiastres / 100).toFixed(2)} EGP) on ${targetDate.toLocaleDateString()}`,
        existingTxnId: matches[0].id,
        strength: 'weak',
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Map a parsed SMS to an editable review model.
 */
export function createReviewItem(
  parsed: ParsedSMS,
  accounts: Account[],
  categories: Category[],
  index: number,
  batchDupeIndices: Set<number>,
  dbDupe: { isDuplicate: boolean; reason?: string },
  /**
   * When the SMS was actually received (from the iOS Shortcut). Used to fill
   * in a missing year and as the time for SMS that carry no date at all.
   * Defaults to now (manual paste).
   */
  referenceDate: Date = new Date()
): SmsReviewItem {
  // Find accounts
  const bankAccount = accounts.find(a => a.type === 'bank') ?? accounts[0];
  const cashAccount = accounts.find(a => a.type === 'cash') ?? accounts[0];
  const vodafoneAccount = accounts.find(a => a.type === 'vodafone_cash') ?? accounts[0];

  // Default suggested account
  let defaultAccount = bankAccount;
  if (parsed.suggestedAccountType === 'vodafone_cash') defaultAccount = vodafoneAccount;
  else if (parsed.suggestedAccountType === 'cash') defaultAccount = cashAccount;

  // Determine action
  const isBalanceOnly = parsed.transactionType === 'balance_only' || parsed.amountPiastres === null;
  let action: SmsReviewItem['action'];
  let toAccountId: number | undefined = undefined;

  if (isBalanceOnly) {
    action = 'ignore';
  } else if (parsed.transactionType === 'atm_withdrawal') {
    // ATM withdrawals are transfers from Bank to Cash Wallet
    action = 'transfer';
    defaultAccount = bankAccount;
    toAccountId = cashAccount?.id;
  } else if (parsed.transactionType === 'wallet_deposit') {
    // Cash handed in at a store/agent: Cash Wallet → wallet account
    action = 'transfer';
    toAccountId = defaultAccount?.id;
    defaultAccount = cashAccount;
  } else if (parsed.transactionType === 'wallet_withdrawal') {
    // Cash taken out of the wallet: wallet account → Cash Wallet
    action = 'transfer';
    toAccountId = cashAccount?.id;
  } else if (parsed.direction === 'inbound' || parsed.transactionType === 'income' || parsed.transactionType === 'transfer_in') {
    action = 'income';
  } else if (parsed.transactionType === 'transfer_out') {
    // Outbound transfers: default to expense (or transfer if user switches)
    action = 'expense';
  } else {
    action = 'expense';
  }

  // Find category
  let defaultCategoryId: number | undefined;
  if (action === 'income') {
    const incomeCats = categories.filter(c => c.type === 'income');
    const salaryCat = incomeCats.find(c => c.name.toLowerCase().includes('salary'));
    const otherIncome = incomeCats.find(c => c.name.toLowerCase().includes('other'));
    defaultCategoryId = (otherIncome ?? salaryCat ?? incomeCats[0])?.id;
  } else if (action === 'expense') {
    const expenseCats = categories.filter(c => c.type === 'expense');
    if (parsed.transactionType === 'mobile_recharge') {
      const rechargeCat = expenseCats.find(c => c.name.toLowerCase().includes('recharge'));
      defaultCategoryId = (rechargeCat ?? expenseCats[0])?.id;
    } else if (parsed.transactionType === 'card_purchase') {
      const shoppingCat = expenseCats.find(c => c.name.toLowerCase().includes('shopping'));
      const foodCat = expenseCats.find(c => c.name.toLowerCase().includes('food'));
      const uncategorized = expenseCats.find(c => c.name.toLowerCase().includes('uncategorized'));
      const otherCat = expenseCats.find(c => c.name.toLowerCase().includes('other'));
      defaultCategoryId = (uncategorized ?? shoppingCat ?? foodCat ?? otherCat ?? expenseCats[0])?.id;
    } else if (parsed.transactionType === 'transfer_out') {
      const transferCat = expenseCats.find(c => c.name.toLowerCase().includes('transfer'));
      const otherCat = expenseCats.find(c => c.name.toLowerCase().includes('other'));
      const uncategorized = expenseCats.find(c => c.name.toLowerCase().includes('uncategorized'));
      defaultCategoryId = (transferCat ?? uncategorized ?? otherCat ?? expenseCats[0])?.id;
    } else {
      // Default to Uncategorized or Other
      const uncategorized = expenseCats.find(c => c.name.toLowerCase().includes('uncategorized'));
      const otherCat = expenseCats.find(c => c.name.toLowerCase().includes('other'));
      defaultCategoryId = (uncategorized ?? otherCat ?? expenseCats[0])?.id;
    }
  }

  // Find fee category
  const expenseCats = categories.filter(c => c.type === 'expense');
  const billsCat = expenseCats.find(c => c.name.toLowerCase().includes('bills'));
  const transferCat = expenseCats.find(c => c.name.toLowerCase().includes('transfer'));
  const otherCat = expenseCats.find(c => c.name.toLowerCase().includes('other'));
  const feeCategoryId = (billsCat ?? transferCat ?? otherCat ?? expenseCats[0])?.id;

  // Date handling
  const now = referenceDate;
  let dateStr = toInputDateTime(now);
  let dateUnresolved = false;
  let dateWarning: string | undefined = undefined;

  if (parsed.date?.parsed) {
    dateStr = toInputDateTime(parsed.date.parsed);
    dateUnresolved = false;
  } else if (parsed.date?.yearMissing) {
    dateUnresolved = true;
    let year = now.getFullYear();
    let resolved = resolveDateWithYear(parsed.date.raw, year);
    // An SMS can't come from the future: e.g. "28/12" pasted on 2 January
    // belongs to last year.
    if (resolved.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      year -= 1;
      resolved = resolveDateWithYear(parsed.date.raw, year);
    }
    dateStr = toInputDateTime(resolved);
    dateWarning = `Missing year in SMS ('${parsed.date.raw}'). Year defaulted to ${year} — please verify.`;
  } else if (parsed.date === null) {
    dateUnresolved = true;
    dateWarning = 'No date found in SMS. Defaulted to current time.';
  }

  // Merchant / Recipient
  const merchant = parsed.merchant || parsed.recipient || parsed.sender || '';

  // Note
  const noteParts: string[] = [];
  if (parsed.transactionType === 'atm_withdrawal') {
    noteParts.push('ATM withdrawal');
    if (parsed.cardSuffix) noteParts.push(`Card ending ${parsed.cardSuffix}`);
  } else if (parsed.phoneNumber) {
    noteParts.push(`Phone: ${parsed.phoneNumber}`);
  }
  if (parsed.referenceId) {
    noteParts.push(`Ref: ${parsed.referenceId}`);
  }
  const note = noteParts.join(' · ');

  // Duplicates
  const isBatchDuplicate = batchDupeIndices.has(index);
  const isDbDuplicate = dbDupe.isDuplicate;

  // Selected state: uncheck if duplicate or balance_only
  const selected = !isBalanceOnly && !isBatchDuplicate && !isDbDuplicate;

  const hasFee = !!(parsed.feePiastres && parsed.feePiastres > 0);
  const feeEgp = parsed.feePiastres ? (parsed.feePiastres / 100).toFixed(2) : '0';

  return {
    id: `sms-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    parsed,
    selected,
    action,
    amountEgp: parsed.amountPiastres ? (parsed.amountPiastres / 100).toFixed(2) : '',
    accountId: defaultAccount?.id ?? 0,
    toAccountId,
    categoryId: defaultCategoryId,
    merchant,
    note,
    dateStr,
    dateUnresolved,
    dateWarning,
    hasFee,
    feeEgp,
    includeFeeAsExpense: hasFee,
    feeCategoryId,
    isBatchDuplicate,
    isDbDuplicate,
    dbDuplicateReason: dbDupe.reason,
    isBalanceOnly,
  };
}

/**
 * Parse an entire pasted text into ready-to-review SmsReviewItems.
 */
export async function processSmsBatch(
  rawText: string,
  accounts: Account[],
  categories: Category[],
  referenceDate?: Date
): Promise<SmsReviewItem[]> {
  const messages = splitSmsMessages(rawText);
  if (messages.length === 0) return [];

  // Parse each message locally
  const parsedBatch = messages.map(msg => parseSms(msg));

  // Check batch duplicates
  const batchDupeIndices = findDuplicateIndices(parsedBatch);

  // Check database duplicates
  const items: SmsReviewItem[] = [];
  for (let i = 0; i < parsedBatch.length; i++) {
    const parsed = parsedBatch[i];
    const dbDupe = await checkDatabaseDuplicate(parsed);
    items.push(createReviewItem(parsed, accounts, categories, i, batchDupeIndices, dbDupe, referenceDate));
  }

  return items;
}

/**
 * Validate a single review item.
 * Returns null if valid, or an error string if invalid.
 */
export function validateReviewItem(item: SmsReviewItem): string | null {
  if (item.action === 'ignore' || item.isBalanceOnly) {
    return null;
  }

  const amount = parseFloat(item.amountEgp);
  if (isNaN(amount) || amount <= 0) {
    return 'Amount must be a positive number';
  }

  if (!item.accountId) {
    return 'Please select an account';
  }

  if (item.action === 'transfer') {
    if (!item.toAccountId) {
      return 'Transfer requires a destination account';
    }
    if (item.accountId === item.toAccountId) {
      return 'Source and destination accounts must be different';
    }
  }

  if (item.action === 'income' || item.action === 'expense') {
    if (!item.categoryId) {
      return 'Please select a category';
    }
  }

  const date = new Date(item.dateStr);
  if (isNaN(date.getTime())) {
    return 'Invalid date/time';
  }

  if (item.hasFee && item.includeFeeAsExpense) {
    const fee = parseFloat(item.feeEgp);
    if (isNaN(fee) || fee <= 0) {
      return 'Fee must be a positive number or uncheck fee';
    }
  }

  return null;
}

/**
 * Confirm and save all selected review items.
 * Uses existing transaction service: addIncome, addExpense, addTransfer.
 * Balance-only messages never create income/expense transactions.
 * Preserves original SMS text.
 */
export async function saveConfirmedReviewItems(
  items: SmsReviewItem[]
): Promise<{
  savedCount: number;
  feeCount: number;
  errors: string[];
  /** IDs of every transaction created, in order (main, then fee). */
  transactionIds: number[];
}> {
  const selectedItems = items.filter(it => it.selected && it.action !== 'ignore' && !it.isBalanceOnly);
  let savedCount = 0;
  let feeCount = 0;
  const errors: string[] = [];
  const transactionIds: number[] = [];

  for (const item of selectedItems) {
    const valError = validateReviewItem(item);
    if (valError) {
      errors.push(`Message "${item.merchant || item.parsed.originalText.slice(0, 20)}": ${valError}`);
      continue;
    }

    try {
      const amountPiastres = Math.round(parseFloat(item.amountEgp) * 100);
      const date = new Date(item.dateStr);
      const originalSms = item.parsed.originalText;
      const smsFingerprint = item.parsed.fingerprint;
      const referenceId = item.parsed.referenceId || undefined;

      if (item.action === 'income') {
        transactionIds.push(await addIncome({
          amount: amountPiastres,
          accountId: item.accountId,
          categoryId: item.categoryId!,
          merchant: item.merchant || undefined,
          note: item.note || undefined,
          date,
          originalSms,
          smsFingerprint,
          referenceId,
        }));
        savedCount++;
      } else if (item.action === 'expense') {
        transactionIds.push(await addExpense({
          amount: amountPiastres,
          accountId: item.accountId,
          categoryId: item.categoryId!,
          merchant: item.merchant || undefined,
          note: item.note || undefined,
          date,
          originalSms,
          smsFingerprint,
          referenceId,
        }));
        savedCount++;
      } else if (item.action === 'transfer') {
        transactionIds.push(await addTransfer({
          amount: amountPiastres,
          fromAccountId: item.accountId,
          toAccountId: item.toAccountId!,
          note: item.note || undefined,
          date,
          originalSms,
          smsFingerprint,
          referenceId,
        }));
        savedCount++;
      }

      // Handle separate fee expense if present and selected
      if (item.hasFee && item.includeFeeAsExpense) {
        const feePiastres = Math.round(parseFloat(item.feeEgp) * 100);
        if (feePiastres > 0) {
          transactionIds.push(await addExpense({
            amount: feePiastres,
            accountId: item.accountId,
            categoryId: item.feeCategoryId ?? item.categoryId!,
            note: `Fee for ${referenceId ? 'ref ' + referenceId : 'transaction'}`,
            date,
            originalSms: `[Fee] ${originalSms}`,
            smsFingerprint: `${smsFingerprint}:fee`,
            referenceId: referenceId ? `${referenceId}-fee` : undefined,
          }));
          feeCount++;
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Failed to save transaction');
    }
  }

  return { savedCount, feeCount, errors, transactionIds };
}
