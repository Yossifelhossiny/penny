import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { db } from '../../db';
import type { Debt, DebtDirection } from '../../types';
import { addRepayment, createDebt, debtOutstanding, deleteDebt, settleDebt, updateDebt } from '../../services/debts';
import { formatEGP, parseLocalDateInput, toLocalDateInput, toPiastres } from '../../utils/format';
import { Amount, AmountInput, Banner, Button, ConfirmSheet, Field, ProgressBar, Segmented, Select, Sheet, TextInput } from '../ui';

/** Add or edit a debt. */
export function DebtFormSheet({ debt, defaultPersonId, onClose }: { debt?: Debt; defaultPersonId?: number; onClose: () => void }) {
  const people = useLiveQuery(() => db.people.orderBy('id').toArray()) ?? [];
  const [direction, setDirection] = useState<DebtDirection>(debt?.direction ?? 'lent');
  const [personId, setPersonId] = useState<number>(debt?.personId ?? defaultPersonId ?? 0);
  const [newName, setNewName] = useState('');
  const [amountStr, setAmountStr] = useState(debt ? (debt.amountPiastres / 100).toString() : '');
  const [reason, setReason] = useState(debt?.reason ?? '');
  const [dateStr, setDateStr] = useState(toLocalDateInput(debt?.date ?? new Date()));
  const [dueStr, setDueStr] = useState(debt?.dueDate ? toLocalDateInput(debt.dueDate) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return setError('Enter an amount greater than zero');
    if (!personId && !newName.trim()) return setError('Choose who this is with, or type a new name');
    setSaving(true);
    try {
      const input = {
        personId: personId || undefined,
        personName: personId ? undefined : newName,
        direction,
        amountPiastres: toPiastres(amount),
        reason,
        date: parseLocalDateInput(dateStr),
        dueDate: dueStr ? parseLocalDateInput(dueStr) : null,
      };
      if (debt?.id) await updateDebt(debt.id, input);
      else await createDebt(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={debt ? 'Edit debt' : 'New debt'}
      onClose={onClose}
      footer={
        <Button type="submit" form="debt-form" size="lg" block loading={saving}>
          {debt ? 'Save changes' : direction === 'lent' ? 'Save — they owe me' : 'Save — I owe them'}
        </Button>
      }
    >
      <form id="debt-form" onSubmit={save} className="space-y-5">
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'lent', label: 'I lent money' },
            { value: 'borrowed', label: 'I borrowed money' },
          ]}
        />
        <AmountInput tone={direction === 'lent' ? 'income' : 'expense'} value={amountStr} onChange={(e) => setAmountStr(e.target.value)} aria-label="Amount in EGP" autoFocus={!debt} />

        <Field label={direction === 'lent' ? 'Lent to' : 'Borrowed from'}>
          <Select value={personId} onChange={(e) => setPersonId(Number(e.target.value))}>
            <option value={0}>Someone new…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        {!personId && (
          <Field label="Name">
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Karim" dir="auto" />
          </Field>
        )}

        <Field label="What for">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Rent share for November" dir="auto" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </Field>
          <Field label="Due by">
            <TextInput type="date" value={dueStr} onChange={(e) => setDueStr(e.target.value)} />
          </Field>
        </div>
        <p className="text-[13px] text-ink-3 px-0.5">Debts are a record only — they don’t change your account balances.</p>
        {error && <Banner tone="error">{error}</Banner>}
      </form>
    </Sheet>
  );
}

/** A debt's details: progress, repayments, and actions. */
export function DebtDetailSheet({ debt, personName, onClose }: { debt: Debt; personName: string; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'settle' | null>(null);
  const [payStr, setPayStr] = useState('');
  const [error, setError] = useState('');
  const outstanding = debtOutstanding(debt);
  const paid = debt.amountPiastres - outstanding;
  const lent = debt.direction === 'lent';

  if (editing) return <DebtFormSheet debt={debt} onClose={onClose} />;
  if (confirm === 'delete')
    return (
      <ConfirmSheet
        title="Delete this debt?"
        message="The record and its repayments will be removed."
        confirmLabel="Delete"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await deleteDebt(debt.id!);
          onClose();
        }}
      />
    );
  if (confirm === 'settle')
    return (
      <ConfirmSheet
        tone="primary"
        title="Mark as fully paid?"
        message={`The remaining ${formatEGP(outstanding)} will be recorded as repaid today.`}
        confirmLabel="Mark paid"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await settleDebt(debt.id!);
          onClose();
        }}
      />
    );

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await addRepayment(debt.id!, toPiastres(parseFloat(payStr) || 0), new Date());
      setPaying(false);
      setPayStr('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }

  return (
    <Sheet
      title={lent ? `${personName} owes you` : `You owe ${personName}`}
      description={debt.reason}
      onClose={onClose}
      footer={
        debt.status === 'open' ? (
          paying ? (
            <form onSubmit={pay} className="space-y-3">
              <AmountInput value={payStr} onChange={(e) => setPayStr(e.target.value)} aria-label="Repayment amount" autoFocus />
              {error && <Banner tone="error">{error}</Banner>}
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="plain" size="lg" onClick={() => setPaying(false)}>Cancel</Button>
                <Button type="submit" size="lg">Record payment</Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="secondary" size="lg" onClick={() => setPaying(true)}>Part payment</Button>
              <Button size="lg" icon={<CheckCircle2 className="size-4" />} onClick={() => setConfirm('settle')}>Fully paid</Button>
            </div>
          )
        ) : undefined
      }
    >
      <div className="text-center pb-4">
        <p className="text-[13px] font-semibold text-ink-3">{debt.status === 'settled' ? 'Settled' : 'Still to pay'}</p>
        <Amount piastres={outstanding} size="xl" tone={lent ? 'income' : 'neutral'} className="mt-1" />
        <p className="text-[13px] text-ink-3 mt-1 num">of {formatEGP(debt.amountPiastres)}</p>
      </div>
      <ProgressBar value={debt.amountPiastres ? (paid / debt.amountPiastres) * 100 : 0} tone="brand" />
      <dl className="rounded-2xl bg-well/70 px-4 py-1 mt-5">
        {[
          ['Date', debt.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
          ...(debt.dueDate ? [['Due by', debt.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })]] : []),
          ['Repaid', formatEGP(paid)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-3 [&+&]:border-t [&+&]:border-hairline">
            <dt className="text-sm text-ink-3">{k}</dt>
            <dd className="text-sm font-semibold text-ink num">{v}</dd>
          </div>
        ))}
      </dl>
      {debt.repayments.length > 0 && (
        <div className="mt-5">
          <p className="text-[13px] font-semibold text-ink-3 px-1 mb-2">Repayments</p>
          <ul className="space-y-1.5">
            {debt.repayments.map((r, i) => (
              <li key={i} className="flex justify-between text-sm px-1">
                <span className="text-ink-2">{r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{r.note ? ` · ${r.note}` : ''}</span>
                <span className="num font-semibold">{formatEGP(r.amountPiastres)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-between mt-6">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
        <Button variant="ghost" size="sm" className="!text-expense" icon={<Trash2 className="size-4" />} onClick={() => setConfirm('delete')}>Delete</Button>
      </div>
    </Sheet>
  );
}
