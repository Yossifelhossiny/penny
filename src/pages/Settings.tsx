import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CalendarClock, HandCoins, Inbox, Lock, Shapes, Target, Trash2 } from 'lucide-react';
import { db } from '../db';
import type { Page } from '../types';
import { findMisdatedTransactions, type DateSuggestion } from '../services/dateAudit';
import { BackupExport } from '../components/settings/BackupExport';
import { AutoImportCard } from '../components/settings/AutoImportCard';
import { DateFixSheet } from '../components/settings/DateFixSheet';
import { MonthlyIncomeCard } from '../components/settings/MonthlyIncomeCard';
import { DataSafetyCard } from '../components/settings/DataSafetyCard';
import { PennyMark } from '../components/layout/PennyMark';
import { Card, ConfirmSheet, IconButton, ListRow, PageHeader, Section } from '../components/ui';

export function Settings({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const txnCount = useLiveQuery(() => db.transactions.count());
  const categoryCount = useLiveQuery(() => db.categories.count());
  const budgetCount = useLiveQuery(() => db.budgets.count());
  const goalCount = useLiveQuery(() => db.goals.count());
  const pendingSms = useLiveQuery(() => db.smsInbox.where('status').equals('pending').count(), [], 0);
  const [misdated, setMisdated] = useState<DateSuggestion[]>([]);
  const [showDateFix, setShowDateFix] = useState(false);
  const [confirmClear, setConfirmClear] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    findMisdatedTransactions().then(setMisdated);
  }, [txnCount]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        leading={
          onNavigate && (
            <IconButton label="Back to home" onClick={() => onNavigate('dashboard')} className="-ml-2.5 mt-[-2px]">
              <ArrowLeft className="size-5" />
            </IconButton>
          )
        }
      />

      <AutoImportCard />
      <MonthlyIncomeCard />

      {onNavigate && (
        <Section title="Organise">
          <Card padded={false} className="py-1.5">
            <ListRow icon={<Inbox />} label="Import SMS" detail={pendingSms > 0 ? `${pendingSms} waiting for review` : 'Paste or sync bank messages'} onClick={() => onNavigate('import')} />
            <ListRow icon={<HandCoins />} label="People & debts" detail="Who sent you money, who owes whom" onClick={() => onNavigate('people')} />
            <ListRow icon={<Shapes />} label="Categories" detail={`${categoryCount ?? 0} categories`} onClick={() => onNavigate('categories')} />
            <ListRow
              icon={<Target />}
              label="Budgets & goals"
              detail={`${budgetCount ?? 0} ${budgetCount === 1 ? 'limit' : 'limits'} · ${goalCount ?? 0} ${goalCount === 1 ? 'goal' : 'goals'}`}
              onClick={() => onNavigate('budgets')}
            />
          </Card>
        </Section>
      )}

      <DataSafetyCard />

      <Section title="Your data">
        <Card padded={false} className="py-1.5">
          <BackupExport />
          {misdated.length > 0 && (
            <ListRow icon={<CalendarClock />} label="Fix transaction dates" detail={`${misdated.length} filed under the wrong month`} onClick={() => setShowDateFix(true)} />
          )}
          <ListRow icon={<Trash2 />} tone="danger" label="Delete all transactions" detail={`${txnCount ?? 0} transactions`} onClick={() => setConfirmClear(1)} disabled={!txnCount} />
        </Card>
      </Section>

      <Card className="flex items-center gap-4 bg-grad-soft shadow-none">
        <PennyMark className="size-11 shrink-0" />
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink">Penny</p>
          <p className="text-[13px] text-ink-2 flex items-center gap-1.5 mt-0.5">
            <Lock className="size-3.5 shrink-0" /> Your money data lives on this device. Amounts in EGP.
          </p>
        </div>
      </Card>

      {showDateFix && <DateFixSheet suggestions={misdated} onClose={() => setShowDateFix(false)} onApplied={() => findMisdatedTransactions().then(setMisdated)} />}
      {confirmClear === 1 && (
        <ConfirmSheet
          title="Delete all transactions?"
          message={`All ${txnCount} transactions will be removed and balances return to their starting amounts. Accounts, categories and budgets stay.`}
          confirmLabel="Continue"
          onClose={() => setConfirmClear(0)}
          onConfirm={() => setConfirmClear(2)}
        />
      )}
      {confirmClear === 2 && (
        <ConfirmSheet
          title="This can’t be undone"
          message="Download a backup first if you might want this history later."
          confirmLabel="Delete everything"
          onClose={() => setConfirmClear(0)}
          onConfirm={async () => {
            await db.transactions.clear();
            setConfirmClear(0);
          }}
        />
      )}
    </div>
  );
}
