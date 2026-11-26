/**
 * Finds transactions that were saved under the wrong month.
 *
 * Before the SMS date fix, some Egyptian bank SMS (whose numbers are wrapped
 * in invisible right-to-left marks) were read with day and month swapped —
 * "26-11" became "11-26" — and saved months in the future (e.g. February
 * 2027). Those records still exist; they just don't show up in November.
 *
 * Nothing is changed automatically. The user reviews the suggestions and
 * confirms; only the `date` field of the confirmed records is updated.
 */

import { db } from '../db';
import type { Transaction } from '../types';
import { parseSms } from './sms/smsParserService';
import { resolveYearlessDate } from './sms/parserUtils';
import { asDate } from '../utils/months';

const DAY = 24 * 60 * 60 * 1000;

export interface DateSuggestion {
  id: number;
  type: Transaction['type'];
  amount: number;
  merchant?: string;
  originalSms: string;
  currentDate: Date | null;
  suggestedDate: Date;
  reason: 'future' | 'invalid';
}

/** Where the SMS says the transaction happened, anchored at import time. */
export function expectedSmsDate(sms: string, importedAt: Date): Date | null {
  const parsed = parseSms(sms);
  if (parsed.date?.parsed) return parsed.date.parsed;
  if (parsed.date?.raw) return resolveYearlessDate(parsed.date.raw, importedAt);
  return null;
}

export async function findMisdatedTransactions(): Promise<DateSuggestion[]> {
  const all = await db.transactions.toArray();
  const out: DateSuggestion[] = [];

  for (const t of all) {
    if (t.id == null) continue;
    const current = asDate(t.date);
    const importedAt = asDate(t.createdAt);

    // A date that isn't a real Date can't be found by any month query.
    if (!current) {
      const suggested = (t.originalSms && importedAt && expectedSmsDate(t.originalSms, importedAt)) || importedAt;
      if (suggested) {
        out.push({ id: t.id, type: t.type, amount: t.amount, merchant: t.merchant, originalSms: t.originalSms ?? '', currentDate: null, suggestedDate: suggested, reason: 'invalid' });
      }
      continue;
    }

    if (!t.originalSms || !importedAt) continue;
    // An SMS describes something that already happened: a date well after the
    // moment it was imported means it was misread.
    if (current.getTime() <= importedAt.getTime() + DAY) continue;

    const suggested = expectedSmsDate(t.originalSms, importedAt);
    if (!suggested) continue;
    if (suggested.getTime() > importedAt.getTime() + DAY) continue;
    if (Math.abs(suggested.getTime() - current.getTime()) < DAY) continue;

    out.push({ id: t.id, type: t.type, amount: t.amount, merchant: t.merchant, originalSms: t.originalSms, currentDate: current, suggestedDate: suggested, reason: 'future' });
  }

  return out.sort((a, b) => b.suggestedDate.getTime() - a.suggestedDate.getTime());
}

/** Apply confirmed suggestions. Only the date changes; amounts and accounts stay as they are. */
export async function applyDateSuggestions(items: Pick<DateSuggestion, 'id' | 'suggestedDate'>[]): Promise<number> {
  let changed = 0;
  await db.transaction('rw', db.transactions, async () => {
    for (const item of items) {
      changed += await db.transactions.update(item.id, { date: item.suggestedDate });
    }
  });
  return changed;
}
