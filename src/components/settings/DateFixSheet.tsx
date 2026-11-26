import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { applyDateSuggestions, type DateSuggestion } from '../../services/dateAudit';
import { Amount, Banner, Button, Sheet, cx } from '../ui';

const fmt = (d: Date | null) =>
  d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unreadable date';

/**
 * Review transactions that were filed under the wrong month (misread SMS
 * dates). Nothing changes until the user confirms; only dates are updated.
 */
export function DateFixSheet({ suggestions, onClose, onApplied }: { suggestions: DateSuggestion[]; onClose: () => void; onApplied: () => void }) {
  const [picked, setPicked] = useState<Set<number>>(() => new Set(suggestions.map((s) => s.id)));
  const [busy, setBusy] = useState(false);

  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function apply() {
    setBusy(true);
    await applyDateSuggestions(suggestions.filter((s) => picked.has(s.id)));
    setBusy(false);
    onApplied();
    onClose();
  }

  return (
    <Sheet
      title="Fix transaction dates"
      description="These came from SMS whose date was read the wrong way round, so they ended up in the wrong month."
      onClose={onClose}
      size="lg"
      footer={
        <Button size="lg" block loading={busy} disabled={picked.size === 0} onClick={apply}>
          Move {picked.size} to the right date
        </Button>
      }
    >
      <Banner tone="info" className="mb-4">Only the date changes. Amounts, accounts and balances stay exactly as they are.</Banner>
      <ul className="space-y-2">
        {suggestions.map((s) => {
          const on = picked.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-pressed={on}
                className={cx('w-full text-left rounded-2xl p-4 transition-colors', on ? 'bg-brand-50 ring-2 ring-brand-400' : 'bg-well/70')}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink truncate" dir="auto">{s.merchant || 'SMS transaction'}</span>
                  <Amount piastres={s.amount} size="sm" tone={s.type === 'income' ? 'income' : 'neutral'} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-[13px]">
                  <CalendarClock className="size-4 text-ink-3 shrink-0" />
                  <span className="text-ink-3 line-through">{fmt(s.currentDate)}</span>
                  <span className="text-ink-3">→</span>
                  <span className="font-semibold text-brand-700">{fmt(s.suggestedDate)}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
