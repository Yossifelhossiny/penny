import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel } from '../../utils/months';
import { IconButton } from './Button';
import type { MonthSelection } from '../../hooks/useMonthSelection';

/** Month stepper with a "Today" shortcut when away from the current month. */
export function MonthSwitcher({ sel, className }: { sel: MonthSelection; className?: string }) {
  const sameYear = sel.year === sel.today.getFullYear();
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <IconButton label="Previous month" size="sm" onClick={sel.prev}>
        <ChevronLeft className="size-[18px]" />
      </IconButton>
      <button
        type="button"
        onClick={sel.goToCurrent}
        className="min-w-[7.5rem] text-center text-[15px] font-semibold text-ink px-1"
        aria-live="polite"
        title={sel.isCurrent ? undefined : 'Back to this month'}
      >
        {monthLabel(sel.year, sel.month)}
        {!sameYear && <span className="text-ink-3 font-medium"> {sel.year}</span>}
      </button>
      <IconButton label="Next month" size="sm" onClick={sel.next}>
        <ChevronRight className="size-[18px]" />
      </IconButton>
      {!sel.isCurrent && (
        <button type="button" onClick={sel.goToCurrent} className="ml-1 h-7 px-2.5 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
          Today
        </button>
      )}
    </div>
  );
}
