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
 * Normalize Arabic/Eastern Arabic numerals to Western Arabic.
 */
export function normalizeArabicNumerals(text: string): string {
  return text
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
