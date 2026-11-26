import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, Check } from 'lucide-react';
import { db } from '../../db';
import { addIncome, addExpense, addTransfer, editTransaction, getAllBalances } from '../../services/transactions';
import { applyCategoryToMatching, countUncategorizedMatching, learnCategory } from '../../services/categoryRules';
import { toPiastres, toLocalDateTimeInput, formatEGP } from '../../utils/format';
import type { TransactionType } from '../../types';
import { AmountInput, Banner, Button, CategoryIcon, Field, Segmented, Select, Sheet, TextInput, Toggle, cx } from '../ui';

export type EntryMode = 'expense' | 'income' | 'transfer';

interface EditingTransaction {
  id: number;
  amount: number; // piastres
  type: TransactionType;
  accountId: number;
  categoryId?: number;
  merchant?: string;
  note?: string;
  date: Date;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
  editingTransaction?: EditingTransaction;
  defaultAccountId?: number;
  /** Which tab to open on (new entries only). */
  initialMode?: EntryMode;
}

/**
 * One sheet for every way money moves: expense, income or transfer.
 * When editing, the type is fixed and only the matching form is shown.
 */
export function AddTransactionForm({ onClose, onSaved, editingTransaction, defaultAccountId, initialMode = 'expense' }: Props) {
  const isEditing = !!editingTransaction;
  const [mode, setMode] = useState<EntryMode>(
    editingTransaction ? (editingTransaction.type === 'income' ? 'income' : 'expense') : initialMode
  );
  const [saving, setSaving] = useState(false);
  const formId = 'txn-form';
  const done = () => {
    onSaved();
    onClose();
  };

  return (
    <Sheet
      title={isEditing ? 'Edit transaction' : 'New transaction'}
      onClose={onClose}
      footer={
        <Button type="submit" form={formId} size="lg" block loading={saving}>
          {isEditing ? 'Save changes' : mode === 'transfer' ? 'Transfer' : mode === 'income' ? 'Add income' : 'Add expense'}
        </Button>
      }
    >
      {!isEditing && (
        <Segmented
          label="Transaction type"
          className="mb-1"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfer' },
          ]}
        />
      )}
      {mode === 'transfer' ? (
        <TransferFields formId={formId} onDone={done} onSaving={setSaving} defaultFromAccountId={defaultAccountId} />
      ) : (
        <IncomeExpenseFields
          key={mode}
          formId={formId}
          type={mode}
          editing={editingTransaction}
          defaultAccountId={defaultAccountId}
          onDone={done}
          onSaving={setSaving}
        />
      )}
    </Sheet>
  );
}

/** Kept for existing callers: opens the sheet on the Transfer tab. */
export function TransferForm({ onClose, onSaved, defaultFromAccountId }: { onClose: () => void; onSaved: () => void; defaultFromAccountId?: number }) {
  return <AddTransactionForm onClose={onClose} onSaved={onSaved} defaultAccountId={defaultFromAccountId} initialMode="transfer" />;
}

function IncomeExpenseFields({
  formId,
  type,
  editing,
  defaultAccountId,
  onDone,
  onSaving,
}: {
  formId: string;
  type: 'income' | 'expense';
  editing?: EditingTransaction;
  defaultAccountId?: number;
  onDone: () => void;
  onSaving: (v: boolean) => void;
}) {
  const [amountStr, setAmountStr] = useState(editing ? (editing.amount / 100).toString() : '');
  const [accountId, setAccountId] = useState<number>(editing?.accountId ?? defaultAccountId ?? 0);
  const [categoryId, setCategoryId] = useState<number>(editing?.categoryId ?? 0);
  const [merchant, setMerchant] = useState(editing?.merchant ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [dateStr, setDateStr] = useState(toLocalDateTimeInput(editing?.date ?? new Date()));
  const [error, setError] = useState('');

  const accounts = useLiveQuery(() => db.accounts.toArray());
  const categories = useLiveQuery(() => db.categories.where('type').equals(type).toArray(), [type]);
  const [applySimilar, setApplySimilar] = useState(true);
  // Other uncategorized transactions from the same merchant/person.
  const similar = useLiveQuery(
    async () => (merchant.trim() ? countUncategorizedMatching(merchant, type, editing?.id) : 0),
    [merchant, type, editing?.id],
    0
  );
  const chosen = categories?.find((c) => c.id === categoryId);
  const canLearn = !!merchant.trim() && !!chosen && !/^uncategorized$/i.test(chosen.name);

  // Default to the first account once accounts load.
  if (accountId === 0 && accounts && accounts.length > 0 && !editing) {
    setAccountId(accounts[0].id!);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    onSaving(true);
    try {
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) throw new Error('Enter an amount greater than zero');
      if (!accountId) throw new Error('Choose an account');
      if (!categoryId) throw new Error('Choose a category');

      const payload = {
        amount: toPiastres(amount),
        accountId,
        categoryId,
        merchant: merchant.trim() || undefined,
        note: note.trim() || undefined,
        date: new Date(dateStr),
      };

      if (editing) await editTransaction(editing.id, { ...payload, type });
      else if (type === 'income') await addIncome(payload);
      else await addExpense(payload);
      // Remember this merchant/person → category for future SMS.
      if (canLearn) {
        await learnCategory(merchant, type, categoryId);
        if (applySimilar && similar > 0) await applyCategoryToMatching(merchant, type, categoryId, editing?.id);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      <AmountInput
        tone={type === 'income' ? 'income' : 'expense'}
        value={amountStr}
        onChange={(e) => setAmountStr(e.target.value)}
        aria-label="Amount in EGP"
        autoFocus={!editing}
        required
      />

      <Field label="Category">
        <div className="grid grid-cols-4 gap-1.5">
          {categories?.map((cat) => {
            const active = categoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id!)}
                aria-pressed={active}
                className={cx(
                  'relative flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 transition-colors',
                  active ? 'bg-brand-50 ring-2 ring-brand-500' : 'hover:bg-well'
                )}
              >
                <CategoryIcon category={cat} size="sm" />
                <span className={cx('text-[11px] leading-tight text-center line-clamp-2', active ? 'text-brand-800 font-semibold' : 'text-ink-2 font-medium')}>
                  {cat.name}
                </span>
                {active && (
                  <span className="absolute top-1.5 right-1.5 size-4 rounded-full bg-brand-500 text-white flex items-center justify-center">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Account">
        <Select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} required>
          <option value={0} disabled>Choose</option>
          {accounts?.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </Field>

      <Field label="Date and time">
        <TextInput type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
      </Field>

      <Field label={type === 'income' ? 'From' : 'Paid to'}>
        <TextInput
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder={type === 'income' ? 'e.g. Upwork' : 'e.g. Carrefour'}
          autoComplete="off"
        />
      </Field>

      <Field label="Note">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" autoComplete="off" />
      </Field>

      {canLearn && (
        <div className="rounded-2xl bg-brand-50 px-4 py-3 space-y-2.5">
          <p className="text-[13px] text-brand-800">
            Penny will file future SMS from <span className="font-semibold" dir="auto">{merchant.trim()}</span> under <span className="font-semibold">{chosen?.name}</span>.
          </p>
          {similar > 0 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-ink">
                Also move {similar} uncategorized {similar === 1 ? 'transaction' : 'transactions'} from them
              </span>
              <Toggle label="Apply to similar transactions" checked={applySimilar} onChange={setApplySimilar} />
            </div>
          )}
        </div>
      )}

      {error && <Banner tone="error">{error}</Banner>}
    </form>
  );
}

function TransferFields({
  formId,
  defaultFromAccountId,
  onDone,
  onSaving,
}: {
  formId: string;
  defaultFromAccountId?: number;
  onDone: () => void;
  onSaving: (v: boolean) => void;
}) {
  const [amountStr, setAmountStr] = useState('');
  const [fromAccountId, setFromAccountId] = useState<number>(defaultFromAccountId ?? 0);
  const [toAccountId, setToAccountId] = useState<number>(0);
  const [note, setNote] = useState('');
  const [dateStr, setDateStr] = useState(() => toLocalDateTimeInput(new Date()));
  const [error, setError] = useState('');
  const [balances, setBalances] = useState<Map<number, number>>(new Map());

  const accounts = useLiveQuery(() => db.accounts.toArray());

  useEffect(() => {
    getAllBalances().then(setBalances);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    onSaving(true);
    try {
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) throw new Error('Enter an amount greater than zero');
      if (!fromAccountId) throw new Error('Choose where the money comes from');
      if (!toAccountId) throw new Error('Choose where the money goes');
      if (fromAccountId === toAccountId) throw new Error('Pick two different accounts');

      await addTransfer({
        amount: toPiastres(amount),
        fromAccountId,
        toAccountId,
        note: note.trim() || undefined,
        date: new Date(dateStr),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      onSaving(false);
    }
  }

  const label = (id: number | undefined, name: string) => `${name} · ${formatEGP(balances.get(id!) ?? 0)}`;

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      <AmountInput value={amountStr} onChange={(e) => setAmountStr(e.target.value)} aria-label="Amount in EGP" autoFocus required />

      <div className="space-y-2">
        <Field label="From">
          <Select value={fromAccountId} onChange={(e) => setFromAccountId(Number(e.target.value))} required>
            <option value={0} disabled>Choose account</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>{label(a.id, a.name)}</option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-center" aria-hidden>
          <span className="size-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
            <ArrowDown className="size-4" />
          </span>
        </div>
        <Field label="To">
          <Select value={toAccountId} onChange={(e) => setToAccountId(Number(e.target.value))} required>
            <option value={0} disabled>Choose account</option>
            {accounts?.filter((a) => a.id !== fromAccountId).map((a) => (
              <option key={a.id} value={a.id}>{label(a.id, a.name)}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Date and time">
        <TextInput type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
      </Field>
      <Field label="Note">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" autoComplete="off" />
      </Field>

      <p className="text-[13px] text-ink-3 px-0.5">Transfers move money between your own accounts. They don’t count as income or spending.</p>

      {error && <Banner tone="error">{error}</Banner>}
    </form>
  );
}
