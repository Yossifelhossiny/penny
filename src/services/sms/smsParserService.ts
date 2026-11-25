/**
 * SMS Parser Service — unified entry point.
 *
 * Routes SMS text to the correct parser and provides
 * duplicate detection via fingerprints.
 *
 * This service NEVER writes to IndexedDB. It returns
 * ParsedSMS results for user review.
 */

import type { ParsedSMS, SmsSource } from '../../types/sms';
import * as genericBankParser from './genericBankParser';
import * as instaPayParser from './instaPayParser';
import * as vodafoneCashParser from './vodafoneCashParser';
import { normalizeArabicNumerals } from './parserUtils';

/**
 * Detect which SMS source a message is from.
 */
export function detectSource(text: string): SmsSource {
  // Order matters: more specific parsers first
  if (vodafoneCashParser.canParse(text)) return 'vodafone_cash';
  if (instaPayParser.canParse(text)) return 'instapay';
  if (genericBankParser.canParse(text)) return 'generic_bank';
  return 'unknown';
}

/**
 * Parse a single SMS message.
 * Returns a ParsedSMS for user review — does NOT save to DB.
 */
export function parseSms(text: string): ParsedSMS {
  const trimmed = text.trim();
  const source = detectSource(trimmed);

  switch (source) {
    case 'vodafone_cash':
      return vodafoneCashParser.parse(trimmed);
    case 'instapay':
      return instaPayParser.parse(trimmed);
    case 'generic_bank':
      return genericBankParser.parse(trimmed);
    case 'unknown':
      return createUnknownResult(trimmed);
  }
}

/**
 * Parse multiple SMS messages.
 * Returns results with duplicate flags.
 */
export function parseSmsBatch(messages: string[]): ParsedSMS[] {
  return messages.map((msg) => parseSms(msg));
}

/**
 * Check if two parsed SMS results are likely duplicates.
 * Uses fingerprint comparison.
 */
export function isDuplicate(a: ParsedSMS, b: ParsedSMS): boolean {
  return a.fingerprint === b.fingerprint;
}

/**
 * Find duplicates within a batch of parsed results.
 * Returns indices of items that are duplicates of earlier items.
 */
export function findDuplicateIndices(results: ParsedSMS[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();

  for (let i = 0; i < results.length; i++) {
    const fp = results[i].fingerprint;
    if (seen.has(fp)) {
      duplicates.add(i);
    } else {
      seen.set(fp, i);
    }
  }

  return duplicates;
}

function createUnknownResult(text: string): ParsedSMS {
  return {
    source: 'unknown',
    transactionType: 'unknown',
    direction: null,
    amountPiastres: null,
    currency: null,
    feePiastres: null,
    balanceSnapshotPiastres: null,
    merchant: null,
    sender: null,
    recipient: null,
    phoneNumber: null,
    suggestedAccountType: null,
    cardSuffix: null,
    referenceId: null,
    date: null,
    originalText: text,
    fingerprint: `unknown:${simpleHash(text)}`,
    confidence: 'low',
    warnings: ['Could not identify SMS source'],
  };
}

/**
 * Simple string hash for fallback fingerprinting.
 * Not cryptographic — just for dedup within a session.
 */
function simpleHash(str: string): string {
  let hash = 0;
  const normalized = normalizeArabicNumerals(str.trim());
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
