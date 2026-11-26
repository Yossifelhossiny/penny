/**
 * Shared utilities for SMS parsers.
 */

import type { SmsRawDate } from '../../types/sms';

/**
 * Parse an amount string like "160.00" or "1,234.56" to integer piastres.
 * Returns null if the string isn't a valid number.
 */
export function amountToPiastres(raw: string): number | null {
  // Remove commas used as thousands separators
  const cleaned = raw.replace(/,/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

/**
 * Remove invisible bidirectional control characters (RLM, LRM, ALM,
 * embeddings, isolates). Egyptian bank SMS often wrap numbers in them, so
 * "26-11" can be stored as "11‏-‏26" and only *look* right on screen.
 */
export function stripBidiMarks(text: string): string {
  return text.replace(/[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g, '');
}

/**
 * Turn a year-less "DD-MM" / "DD/MM" (optionally followed by HH:MM) into a
 * real date, using when the SMS arrived as the anchor.
 *
 * Because RTL text can arrive with the two numbers swapped, both day-month
 * and month-day readings are tried (only valid calendar dates), across the
 * anchor's year and its neighbours, and the one closest to the anchor wins.
 * Returns null if no valid reading exists.
 */
export function resolveYearlessDate(raw: string, anchor: Date): Date | null {
  const normalized = normalizeArabicNumerals(raw);
  const dm = normalized.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})/);
  if (!dm) return null;
  let hours = 12;
  let minutes = 0;
  const rest = normalized.slice((dm.index ?? 0) + dm[0].length);
  const tm = rest.match(/(\d{1,2}):(\d{2})/);
  if (tm) {
    hours = parseInt(tm[1], 10);
    minutes = parseInt(tm[2], 10);
  }
  const a = parseInt(dm[1], 10);
  const b = parseInt(dm[2], 10);
  const readings: Array<[number, number]> = [[a, b]]; // [day, month]
  if (a !== b) readings.push([b, a]);

  let best: Date | null = null;
  let bestDiff = Infinity;
  for (const [day, month] of readings) {
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    for (const year of [anchor.getFullYear() - 1, anchor.getFullYear(), anchor.getFullYear() + 1]) {
      const d = new Date(year, month - 1, day, hours, minutes);
      if (d.getMonth() !== month - 1) continue; // e.g. 31 February
      // A message can't describe something far in the future; allow a day of clock skew.
      const diff = d.getTime() - anchor.getTime();
      if (diff > 24 * 60 * 60 * 1000) continue;
      if (Math.abs(diff) < bestDiff) {
        bestDiff = Math.abs(diff);
        best = d;
      }
    }
  }
  return best;
}

/**
 * Normalize Arabic/Eastern Arabic numerals to Western Arabic.
 */
export function normalizeArabicNumerals(text: string): string {
  return stripBidiMarks(text)
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
}

/**
 * Parse a date string from SMS text.
 * Egyptian bank SMS formats:
 *   DD/MM  (no year)
 *   DD-MM  (no year)
 *   DD/MM/YY or DD/MM/YYYY
 *   YY-MM-DD  (Vodafone format: 26-05-07)
 *
 * Time formats:
 *   HH:MM  (24h)
 *
 * We NEVER invent a year. If the year is missing, we set yearMissing=true
 * and parsed=null.
 */
export function parseSmsDate(
  dateStr: string,
  timeStr?: string,
  format?: 'dd-mm' | 'dd/mm' | 'yy-mm-dd'
): SmsRawDate {
  const rawParts = [dateStr];
  if (timeStr) rawParts.push(timeStr);
  const raw = rawParts.join(' ');

  const normalized = normalizeArabicNumerals(dateStr.trim());
  const timePart = timeStr ? normalizeArabicNumerals(timeStr.trim()) : undefined;

  let hours = 0;
  let minutes = 0;
  if (timePart) {
    const tm = timePart.match(/(\d{1,2}):(\d{2})/);
    if (tm) {
      hours = parseInt(tm[1], 10);
      minutes = parseInt(tm[2], 10);
    }
  }

  // Vodafone format: YY-MM-DD (e.g. 26-05-07)
  if (format === 'yy-mm-dd') {
    const m = normalized.match(/(\d{2})-(\d{2})-(\d{2})/);
    if (m) {
      const year = 2000 + parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      return {
        raw,
        parsed: new Date(year, month, day, hours, minutes),
        yearMissing: false,
        formatAmbiguous: false,
      };
    }
  }

  // DD/MM/YYYY or DD/MM/YY
  const fullDateSlash = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (fullDateSlash) {
    const day = parseInt(fullDateSlash[1], 10);
    const month = parseInt(fullDateSlash[2], 10) - 1;
    let year = parseInt(fullDateSlash[3], 10);
    if (year < 100) year += 2000;
    return {
      raw,
      parsed: new Date(year, month, day, hours, minutes),
      yearMissing: false,
      formatAmbiguous: false,
    };
  }

  // DD-MM-YYYY or DD-MM-YY (not yy-mm-dd format)
  const fullDateDash = normalized.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (fullDateDash && format !== 'yy-mm-dd') {
    const day = parseInt(fullDateDash[1], 10);
    const month = parseInt(fullDateDash[2], 10) - 1;
    let year = parseInt(fullDateDash[3], 10);
    if (year < 100) year += 2000;
    return {
      raw,
      parsed: new Date(year, month, day, hours, minutes),
      yearMissing: false,
      formatAmbiguous: false,
    };
  }

  // DD/MM (no year)
  const shortSlash = normalized.match(/(\d{1,2})\/(\d{1,2})$/);
  if (shortSlash) {
    return {
      raw,
      parsed: null,
      yearMissing: true,
      formatAmbiguous: false,
    };
  }

  // DD-MM (no year)
  const shortDash = normalized.match(/(\d{1,2})-(\d{1,2})$/);
  if (shortDash) {
    return {
      raw,
      parsed: null,
      yearMissing: true,
      formatAmbiguous: false,
    };
  }

  // Could not parse
  return {
    raw,
    parsed: null,
    yearMissing: true,
    formatAmbiguous: true,
  };
}

/**
 * Build a fingerprint for duplicate detection.
 * Uses referenceId when available, otherwise creates a hash
 * from amount + date + source-specific key.
 */
export function buildFingerprint(parts: {
  source: string;
  referenceId?: string | null;
  amountPiastres?: number | null;
  dateRaw?: string | null;
  counterparty?: string | null;
}): string {
  if (parts.referenceId) {
    return `${parts.source}:ref:${parts.referenceId}`;
  }

  // Fallback: source + amount + date + counterparty
  const components = [
    parts.source,
    parts.amountPiastres?.toString() ?? 'unknown',
    parts.dateRaw ?? 'nodate',
    parts.counterparty ?? 'nocpty',
  ];
  return components.join(':');
}
