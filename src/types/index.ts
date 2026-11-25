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

export type Page = 'dashboard' | 'transactions' | 'accounts' | 'settings' | 'import' | 'budgets' | 'reports';
