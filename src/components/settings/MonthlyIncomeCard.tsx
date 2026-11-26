import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarSync } from 'lucide-react';
import { db } from '../../db';
import { defaultStartMonth, runRecurringIncome, saveRecurringIncome, setRecurringEnabled } from '../../services/recurring';
import { toPiastres, formatEGP } from '../../utils/format';
import { monthLabel, parseMonthKey } from '../../utils/months';
import { Banner, Button, Card, Field, Select, TextInput, Toggle } from '../ui';

/**
 * Automatic monthly income (e.g. salary on the 1st). One rule, switchable
 * on and off. Turning it on never back-fills past months.
 */
export function MonthlyIncomeCard() {
  const rule = useLiveQuery(async () => (await db.recurring.toArray())[0] ?? null);
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const incomeCats = useLiveQuery(() => db.categories.where('type').equals('income').toArray()) ?? [];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('Salary');
  const [amountStr, setAmountStr] = useState('');
  const [accountId, setAccountId] = useState(0);
  const [categoryId, setCategoryId] = useState(0);
  const [day, setDay] = useState(1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Load the saved rule into the form once it arrives (adjusting state during render).
  const [loadedId, setLoadedId] = useState<number | null>(null);
  if (rule?.id && loadedId !== rule.id) {
    setLoadedId(rule.id);
    setName(rule.name);
    setAmountStr((rule.amountPiastres / 100).toString());
    setAccountId(rule.accountId);
    setCategoryId(rule.categoryId);
    setDay(rule.dayOfMonth);
  }

  // Sensible defaults once lists load.
  if (!accountId && accounts.length) setAccountId(accounts.find((a) => a.type === 'bank')?.id ?? accounts[0].id!);
  if (!categoryId && incomeCats.length) setCategoryId(incomeCats.find((c) => c.name === 'Salary')?.id ?? incomeCats[0].id!);

  async function save(enable: boolean) {
    setError('');
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return setError('Enter the monthly amount');
    setSaving(true);
    try {
      await saveRecurringIncome({
        id: rule?.id,
        name,
        amountPiastres: toPiastres(amount),
        accountId,
        categoryId,
        dayOfMonth: day,
        enabled: enable,
        startMonth: rule && rule.enabled && rule.dayOfMonth === day ? rule.startMonth : defaultStartMonth(day),
      });
      await runRecurringIncome();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const on = !!rule?.enabled;
  const start = rule ? parseMonthKey(rule.startMonth) : null;
  const showForm = editing || !rule;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3.5">
        <span className="size-11 rounded-[14px] bg-grad-soft text-brand-700 flex items-center justify-center shrink-0">
          <CalendarSync className="size-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-ink">Monthly income</p>
          <p className="text-[13px] text-ink-3 mt-0.5">
            {rule
              ? on
                ? `${formatEGP(rule.amountPiastres)} added on day ${rule.dayOfMonth} of every month.`
                : 'Paused — nothing is added until you turn it back on.'
              : 'Add your salary automatically every month.'}
          </p>
        </div>
        {rule && (
          <Toggle
            label="Add monthly income automatically"
            checked={on}
            onChange={async (v) => {
              await setRecurringEnabled(rule.id!, v);
              if (v) await runRecurringIncome();
            }}
          />
        )}
      </div>

      {rule && on && start && !editing && (
        <p className="text-[13px] text-ink-2 bg-well/70 rounded-xl px-3 py-2.5">
          Recording from {monthLabel(start.year, start.month)} {start.year}. If you already added this month’s income yourself, nothing is doubled for earlier months.
        </p>
      )}

      {showForm ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Amount (EGP)">
              <TextInput type="number" inputMode="decimal" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0" className="num" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Into account">
              <Select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
                {incomeCats.filter((c) => !/^uncategorized$/i.test(c.name)).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Day of the month" hint="Days 29–31 aren’t offered so every month has the date.">
            <Select value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>Day {d}</option>
              ))}
            </Select>
          </Field>
          {error && <Banner tone="error">{error}</Banner>}
          <div className="flex gap-2.5">
            {rule && <Button variant="plain" onClick={() => setEditing(false)}>Cancel</Button>}
            <Button block loading={saving} onClick={() => save(true)}>
              {rule ? 'Save' : 'Turn on'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit amount or day</Button>
      )}
    </Card>
  );
}
