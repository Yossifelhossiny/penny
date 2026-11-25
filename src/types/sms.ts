/**
 * SMS Parsing Types for Penny
 *
 * These types represent the normalized output of SMS parsers.
 * Parsers produce ParsedSMS results for user review — they never
 * write directly to IndexedDB.
 */

/** Which SMS source produced the message. */
export type SmsSource = 'generic_bank' | 'instapay' | 'vodafone_cash' | 'unknown';

/**
 * Semantic transaction type extracted from SMS.
 * - balance_only: informational, no money moved (e.g. balance inquiry)
 * - fee: a separate fee charge associated with another transaction
 */
export type SmsTransactionType =
  | 'income'
  | 'expense'
  | 'transfer_out'
  | 'transfer_in'
  | 'atm_withdrawal'
  | 'card_purchase'
  | 'mobile_recharge'
  | 'fee'
  | 'balance_only'
  | 'unknown';

/** Direction of money flow. null when direction cannot be determined. */
export type SmsDirection = 'inbound' | 'outbound' | null;

/**
 * A raw date extracted from SMS text.
 * We preserve exactly what was in the SMS and flag ambiguity.
 * We NEVER invent a year.
 */
export interface SmsRawDate {
  /** The raw date string as it appeared in SMS. */
  raw: string;
  /**
   * Parsed Date if unambiguous. null if we can't resolve it safely.
   * When year is missing, this is null and yearMissing is true.
   */
  parsed: Date | null;
  /** True when the SMS didn't include a year. */
  yearMissing: boolean;
  /** True when the date format is ambiguous (e.g. could be DD/MM or MM/DD). */
  formatAmbiguous: boolean;
}

/**
 * Normalized result from parsing a single SMS.
 * This is a data object for user review — it does NOT save to DB.
 */
export interface ParsedSMS {
  /** Which parser handled this. */
  source: SmsSource;

  /** Semantic transaction type. */
  transactionType: SmsTransactionType;

  /** Direction of money flow. */
  direction: SmsDirection;

  /** Amount in piastres (integer). Always positive. null if not extractable. */
  amountPiastres: number | null;

  /** Original currency string from SMS (e.g. "EGP", "جم"). */
  currency: string | null;

  /** Fee in piastres, if a separate fee was mentioned. */
  feePiastres: number | null;

  /** Balance snapshot in piastres, if mentioned. NOT income/expense. */
  balanceSnapshotPiastres: number | null;

  /** Merchant or vendor name, if identifiable. */
  merchant: string | null;

  /** Sender name (for inbound transfers). */
  sender: string | null;

  /** Recipient name (for outbound transfers). */
  recipient: string | null;

  /** Phone number associated (sender or recipient). */
  phoneNumber: string | null;

  /**
   * Which account type this likely maps to.
   * Parsers suggest; user confirms.
   */
  suggestedAccountType: 'bank' | 'vodafone_cash' | 'cash' | null;

  /** Card suffix (last 4 digits) if mentioned. */
  cardSuffix: string | null;

  /** Transaction/reference ID from the SMS. */
  referenceId: string | null;

  /** Date/time extracted from SMS. */
  date: SmsRawDate | null;

  /** The original SMS text, preserved verbatim. */
  originalText: string;

  /**
   * A fingerprint for duplicate detection.
   * Built from referenceId when available, otherwise from
   * amount + date + merchant/recipient + source.
   */
  fingerprint: string;

  /** Parsing confidence: did we extract everything cleanly? */
  confidence: 'high' | 'medium' | 'low';

  /** Any warnings or notes about parsing issues. */
  warnings: string[];
}
