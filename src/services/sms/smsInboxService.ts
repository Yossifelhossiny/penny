/**
 * SMS Inbox Service — automatic import of SMS captured by the iOS Shortcut.
 *
 * Pipeline (one entry at a time, each inside one IndexedDB transaction):
 *
 *   Shortcut inbox file
 *     → parseInboxFile()            split into entries (received time, sender, text)
 *     → entryKey                    stable hash → skip entries already processed
 *     → parseSms()                  existing parser (bank / InstaPay / Vodafone Cash)
 *     → checkDatabaseDuplicate()    existing duplicate detection
 *     → createReviewItem()          existing mapping to account/category/date
 *     → assessForAutoSave()         decide: save / pending / duplicate / ignored
 *     → saveConfirmedReviewItems()  existing transaction service (addIncome/…)
 *     → smsInbox record             original text + outcome, for audit & review
 *
 * Nothing leaves the device. There is no second transaction engine: saving
 * goes through the same functions as the manual import screen.
 */

import { db } from '../../db';
import type { SmsInboxEntry, SmsInboxStatus } from '../../types';
import { parseSms } from './smsParserService';
import { normalizeArabicNumerals } from './parserUtils';
import {
  checkDatabaseDuplicate,
  createReviewItem,
  processSmsBatch,
  saveConfirmedReviewItems,
  splitSmsMessages,
  toInputDateTime,
  validateReviewItem,
  type DbDuplicateResult,
  type SmsReviewItem,
} from './smsImportService';

/** Markers the Shortcut writes around every captured SMS. */
export const ENTRY_BEGIN = '<<<PENNY-SMS';
export const ENTRY_END = 'PENNY-SMS>>>';

/** An SMS date this far from the moment the phone received it is suspicious. */
const MAX_DATE_DRIFT_MS = 3 * 24 * 60 * 60 * 1000;

export interface InboxFileEntry {
  receivedAt: Date | null;
  sender: string | null;
  text: string;
}

export interface InboxEntryResult {
  status: SmsInboxStatus | 'already_processed' | 'error';
  reason: string;
  text: string;
  entryId?: number;
  transactionIds?: number[];
  /** For saved entries — used to word the notification. */
  amountPiastres?: number | null;
  action?: SmsReviewItem['action'];
  counterparty?: string;
  /** Person on the other side of an InstaPay / wallet transfer. */
  personName?: string;
  /** Set when the category came from a rule (so the notification can say where it went). */
  categoryName?: string;
}

export interface InboxImportSummary {
  total: number;
  alreadyProcessed: number;
  saved: number;
  pending: number;
  duplicates: number;
  ignored: number;
  errors: number;
  results: InboxEntryResult[];
}

// ---------------------------------------------------------------------------
// Parsing the inbox file
// ---------------------------------------------------------------------------

function parseReceived(raw: string): Date | null {
  const cleaned = normalizeArabicNumerals(raw.trim());
  if (!cleaned) return null;
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Split the Shortcut's inbox file into entries.
 *
 * Expected block (written by the Shortcut):
 *
 *   <<<PENNY-SMS
 *   received: 2026-11-26T12:46:03+02:00
 *   sender: CIB
 *   ---
 *   <SMS text, may span several lines>
 *   PENNY-SMS>>>
 *
 * Text without any markers is treated as plain pasted SMS (no receive time).
 */
export function parseInboxFile(fileText: string): InboxFileEntry[] {
  const text = fileText.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  if (!text.includes(ENTRY_BEGIN)) {
    return splitSmsMessages(text).map((t) => ({ receivedAt: null, sender: null, text: t }));
  }

  const entries: InboxFileEntry[] = [];
  const blocks = text.split(ENTRY_BEGIN).slice(1);
  for (const rawBlock of blocks) {
    const endIdx = rawBlock.indexOf(ENTRY_END);
    const block = endIdx >= 0 ? rawBlock.slice(0, endIdx) : rawBlock;
    const lines = block.split('\n');

    let receivedAt: Date | null = null;
    let sender: string | null = null;
    let bodyStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '---') {
        bodyStart = i + 1;
        break;
      }
      const m = line.match(/^(received|sender)\s*:\s*(.*)$/i);
      if (m) {
        if (m[1].toLowerCase() === 'received') receivedAt = parseReceived(m[2]);
        else sender = m[2].trim() || null;
      }
    }
    // No "---" line: everything that isn't a header is the body.
    const bodyLines = bodyStart >= 0
      ? lines.slice(bodyStart)
      : lines.filter((l) => !/^(received|sender)\s*:/i.test(l.trim()));
    const body = bodyLines.join('\n').trim();
    if (body) entries.push({ receivedAt, sender, text: body });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

/** 64-bit FNV-1a, as hex. Deterministic and synchronous (works in tests too). */
function fnv1a64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function normalizeSmsText(text: string): string {
  return normalizeArabicNumerals(text).replace(/\s+/g, ' ').trim();
}

/**
 * The same captured SMS always produces the same key, so syncing the same
 * inbox file again (or tapping Sync twice) never creates new records.
 */
export function computeEntryKey(entry: InboxFileEntry): string {
  const when = entry.receivedAt ? entry.receivedAt.toISOString() : 'no-time';
  return `sms:${fnv1a64(`${when}\n${normalizeSmsText(entry.text)}`)}`;
}

// ---------------------------------------------------------------------------
// Auto-save decision
// ---------------------------------------------------------------------------

export interface AutoSaveDecision {
  status: 'auto' | 'pending' | 'duplicate' | 'ignored';
  reason: string;
}

/**
 * Decide whether a review item is safe to save without a human.
 * Mutates `item.dateStr` when the receive time is the best date available.
 */
export function assessForAutoSave(
  item: SmsReviewItem,
  dbDupe: DbDuplicateResult,
  receivedAt: Date | null
): AutoSaveDecision {
  const p = item.parsed;

  if (p.source === 'unknown') {
    return { status: 'ignored', reason: 'Not a supported bank, InstaPay or Vodafone Cash transaction' };
  }
  if (p.transactionType === 'balance_only') {
    return { status: 'ignored', reason: 'Balance notification only — no money moved' };
  }
  if (dbDupe.isDuplicate && dbDupe.strength === 'strong') {
    return { status: 'duplicate', reason: dbDupe.reason ?? 'Already recorded' };
  }
  if (p.transactionType === 'unknown' || !p.amountPiastres) {
    return {
      status: 'pending',
      reason: p.warnings.length ? p.warnings.join('; ') : 'Could not read the amount or transaction type',
    };
  }
  if (item.action === 'ignore') {
    return { status: 'ignored', reason: 'No money movement to record' };
  }

  // --- Date checks ---
  if (!p.date) {
    if (!receivedAt) {
      return { status: 'pending', reason: 'No date in the SMS and no receive time from the Shortcut' };
    }
    // The SMS itself has no date: the moment it arrived is the transaction time.
    item.dateStr = toInputDateTime(receivedAt);
  } else if (!p.date.parsed && !receivedAt) {
    return { status: 'pending', reason: `Year missing in SMS date ('${p.date.raw}') and no receive time to infer it` };
  }

  if (receivedAt) {
    const smsDate = new Date(item.dateStr);
    if (Math.abs(smsDate.getTime() - receivedAt.getTime()) > MAX_DATE_DRIFT_MS) {
      return {
        status: 'pending',
        reason: `SMS date (${smsDate.toLocaleDateString()}) is far from when it arrived (${receivedAt.toLocaleDateString()}) — please check the date`,
      };
    }
  }

  if (dbDupe.isDuplicate) {
    // Weak match: same amount the same day, or same SMS without time/reference.
    return { status: 'pending', reason: dbDupe.reason ?? 'Possible duplicate — please confirm' };
  }

  const validationError = validateReviewItem(item);
  if (validationError) {
    return { status: 'pending', reason: validationError };
  }

  return { status: 'auto', reason: 'Saved automatically' };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Process an inbox file (or pasted text). Safe to call any number of times
 * with the same content: already-processed entries are skipped, and every
 * entry is handled in its own IndexedDB transaction.
 */
export async function importSmsInbox(fileText: string): Promise<InboxImportSummary> {
  return importSmsEntries(parseInboxFile(fileText));
}

/**
 * Process already-split entries (from the inbox file, or one SMS pushed by
 * the Shortcut through the service worker). Same guarantees as above.
 */
export async function importSmsEntries(entries: InboxFileEntry[]): Promise<InboxImportSummary> {
  const summary: InboxImportSummary = {
    total: entries.length,
    alreadyProcessed: 0,
    saved: 0,
    pending: 0,
    duplicates: 0,
    ignored: 0,
    errors: 0,
    results: [],
  };

  for (const entry of entries) {
    const entryKey = computeEntryKey(entry);
    try {
      const result = await db.transaction(
        'rw',
        [db.smsInbox, db.transactions, db.accounts, db.categories, db.categoryRules, db.people],
        async () => await processOneEntry(entry, entryKey)
      );
      summary.results.push(result);
      switch (result.status) {
        case 'already_processed': summary.alreadyProcessed++; break;
        case 'saved': summary.saved++; break;
        case 'pending': summary.pending++; break;
        case 'duplicate': summary.duplicates++; break;
        case 'ignored': summary.ignored++; break;
        default: summary.errors++;
      }
    } catch (err) {
      summary.errors++;
      summary.results.push({
        status: 'error',
        reason: err instanceof Error ? err.message : 'Failed to process SMS',
        text: entry.text,
      });
    }
  }

  return summary;
}

async function processOneEntry(entry: InboxFileEntry, entryKey: string): Promise<InboxEntryResult> {
  const existing = await db.smsInbox.where('entryKey').equals(entryKey).first();
  if (existing) {
    return { status: 'already_processed', reason: `Already processed (${existing.status})`, text: entry.text, entryId: existing.id };
  }

  // Await Dexie calls one by one: a native Promise.all would end the
  // IndexedDB transaction early.
  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();
  const rules = await db.categoryRules.toArray();
  const parsed = parseSms(entry.text);
  const referenceDate = entry.receivedAt ?? new Date();

  // For the duplicate check, give year-less / date-less SMS their full date
  // (resolved from the receive time) so same-day matches can be found.
  let parsedForDupCheck = parsed;
  if (parsed.source !== 'unknown' && entry.receivedAt && !parsed.date?.parsed) {
    const probe = createReviewItem(parsed, accounts, categories, 0, new Set(), { isDuplicate: false }, referenceDate);
    const resolved = parsed.date ? new Date(probe.dateStr) : entry.receivedAt;
    parsedForDupCheck = {
      ...parsed,
      date: { raw: parsed.date?.raw ?? '', parsed: resolved, yearMissing: false, formatAmbiguous: false },
    };
  }
  const dbDupe = parsed.source === 'unknown' ? { isDuplicate: false } : await checkDatabaseDuplicate(parsedForDupCheck);
  const item = createReviewItem(parsed, accounts, categories, 0, new Set(), dbDupe, referenceDate, rules);
  const decision = assessForAutoSave(item, dbDupe, entry.receivedAt);

  let status: SmsInboxStatus;
  let reason = decision.reason;
  let transactionIds: number[] = [];

  if (decision.status === 'auto') {
    item.selected = true;
    // If Penny knows this merchant/person (a rule you taught it, or a known
    // merchant), it files the transaction there. Otherwise it goes under
    // "Uncategorized" for you to sort later.
    if ((item.action === 'income' || item.action === 'expense') && item.categorySource === 'default') {
      item.categoryId = await ensureUncategorizedCategory(item.action);
    }
    const res = await saveConfirmedReviewItems([item], { learn: false });
    if (res.errors.length > 0 || res.transactionIds.length === 0) {
      // Throwing aborts the IndexedDB transaction, so nothing half-saved remains.
      throw new Error(res.errors[0] ?? 'Could not save transaction');
    }
    status = 'saved';
    transactionIds = res.transactionIds;
    if (res.feeCount > 0) reason = 'Saved automatically (with separate fee)';
  } else {
    status = decision.status;
  }

  const now = new Date();
  const entryId = await db.smsInbox.add({
    entryKey,
    receivedAt: entry.receivedAt,
    sender: entry.sender,
    text: entry.text,
    status,
    reason,
    transactionIds,
    createdAt: now,
    updatedAt: now,
  });

  return {
    status,
    reason,
    text: entry.text,
    entryId: entryId as number,
    transactionIds,
    amountPiastres: parsed.amountPiastres,
    action: item.action,
    counterparty: item.personName || item.merchant || undefined,
    personName: item.personName,
    categoryName: item.categorySource !== 'default' ? categories.find((c) => c.id === item.categoryId)?.name : undefined,
  };
}

// ---------------------------------------------------------------------------
// Uncategorized
// ---------------------------------------------------------------------------

export const UNCATEGORIZED_NAME = 'Uncategorized';

/** Id of the "Uncategorized" category of this type, created if missing. */
export async function ensureUncategorizedCategory(type: 'income' | 'expense'): Promise<number> {
  const found = (await db.categories.where('name').equals(UNCATEGORIZED_NAME).toArray()).find(c => c.type === type);
  if (found?.id) return found.id;
  return (await db.categories.add({ name: UNCATEGORIZED_NAME, icon: '❓', type, color: '#94a3b8' })) as number;
}

/** How many income/expense transactions still have no real category. */
export async function countUncategorizedTransactions(): Promise<number> {
  const ids = (await db.categories.where('name').equals(UNCATEGORIZED_NAME).toArray())
    .map(c => c.id)
    .filter((id): id is number => id != null);
  if (ids.length === 0) return 0;
  return db.transactions.where('categoryId').anyOf(ids).count();
}

// ---------------------------------------------------------------------------
// Pending queue helpers
// ---------------------------------------------------------------------------

export async function getInboxEntries(status?: SmsInboxStatus): Promise<SmsInboxEntry[]> {
  const list = status
    ? await db.smsInbox.where('status').equals(status).toArray()
    : await db.smsInbox.toArray();
  return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Build editable review items for a pending entry (uses the receive time). */
export async function reviewItemsForEntry(entry: SmsInboxEntry): Promise<SmsReviewItem[]> {
  const [accounts, categories] = await Promise.all([db.accounts.toArray(), db.categories.toArray()]);
  return processSmsBatch(entry.text, accounts, categories, entry.receivedAt ?? undefined);
}

export async function markInboxEntryResolved(id: number, transactionIds: number[]): Promise<void> {
  await db.smsInbox.update(id, {
    status: 'resolved',
    reason: 'Reviewed and saved',
    transactionIds,
    updatedAt: new Date(),
  });
}

export async function dismissInboxEntry(id: number): Promise<void> {
  await db.smsInbox.update(id, { status: 'dismissed', reason: 'Dismissed by you', updatedAt: new Date() });
}
