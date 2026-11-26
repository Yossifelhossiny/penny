export type AccountType = 'bank' | 'vodafone_cash' | 'cash';

export interface Account {
  id?: number;
  name: string;
  type: AccountType;
  /** Opening balance in piastres (integer). */
  openingBalance: number;
  color: string;
  icon: string;
  createdAt: Date;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id?: number;
  /** Amount in piastres (integer). Always positive. */
  amount: number;
  type: TransactionType;
  categoryId?: number;
  accountId: number;
  /** For transfers — the destination account. */
  toAccountId?: number;
  merchant?: string;
  note?: string;
  date: Date;
  createdAt: Date;
  /** Original SMS text preserved verbatim if imported from SMS. */
  originalSms?: string;
  /** Fingerprint for duplicate detection. */
  smsFingerprint?: string;
  /** Reference / Transaction ID from SMS. */
  referenceId?: string;
}

export interface Category {
  id?: number;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  color: string;
}

export interface Budget {
  id?: number;
  /** Category ID (0 for overall monthly budget). */
  categoryId: number;
  /** Monthly limit in piastres (integer). */
  limitPiastres: number;
  /** Specific month key "YYYY-MM", or null/undefined for recurring default. */
  monthKey?: string | null;
  createdAt: Date;
}

export interface SavingsGoal {
  id?: number;
  name: string;
  /** Target amount in piastres (integer). */
  targetAmountPiastres: number;
  /** Current amount saved in piastres (integer). */
  currentAmountPiastres: number;
  targetDate?: Date | null;
  icon: string;
  color: string;
  createdAt: Date;
}

/**
 * What happened to one SMS that arrived through the iOS Shortcut inbox.
 * - saved: valid & confident → transactions created automatically
 * - pending: financial but ambiguous/incomplete → waiting for review
 * - duplicate: already recorded (same reference / same SMS) → ignored
 * - ignored: not a supported financial transaction (OTP, promo, balance info…)
 * - resolved: a pending item the user reviewed and saved by hand
 * - dismissed: a pending item the user chose to discard
 */
export type SmsInboxStatus = 'saved' | 'pending' | 'duplicate' | 'ignored' | 'resolved' | 'dismissed';

export interface SmsInboxEntry {
  id?: number;
  /** Stable hash of (received time + SMS text). Makes re-syncing idempotent. */
  entryKey: string;
  /** When the iPhone received the SMS (from the Shortcut), if known. */
  receivedAt: Date | null;
  /** Sender name/number as given by iOS, if known. */
  sender: string | null;
  /** The original SMS text, verbatim. */
  text: string;
  status: SmsInboxStatus;
  /** Human-readable reason for the status. */
  reason: string;
  /** Transactions created from this SMS (main + fee). */
  transactionIds: number[];
  createdAt: Date;
  updatedAt: Date;
}

export type Page = 'dashboard' | 'transactions' | 'accounts' | 'settings' | 'import' | 'budgets' | 'reports' | 'categories';
