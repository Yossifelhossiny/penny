import { useState } from 'react';
import { addMonths, compareMonths, sameMonth, yearMonthOf, type YearMonth } from '../utils/months';
import { useToday } from './useToday';

export interface MonthSelection extends YearMonth {
  isCurrent: boolean;
  isFuture: boolean;
  today: Date;
  prev: () => void;
  next: () => void;
  goToCurrent: () => void;
  set: (ym: YearMonth) => void;
}

/**
 * Selected month for month-based screens.
 *
 * Until the user picks another month, the selection *follows* the real
 * current month — so when November starts, every screen moves to November on
 * its own instead of staying on the month the app was opened in.
 */
export function useMonthSelection(): MonthSelection {
  const today = useToday();
  const current = yearMonthOf(today);
  // null = follow the current month
  const [picked, setPicked] = useState<YearMonth | null>(null);
  const selected = picked ?? current;

  const set = (ym: YearMonth) => setPicked(sameMonth(ym, current) ? null : ym);

  return {
    ...selected,
    today,
    isCurrent: sameMonth(selected, current),
    isFuture: compareMonths(selected, current) > 0,
    prev: () => set(addMonths(selected, -1)),
    next: () => set(addMonths(selected, 1)),
    goToCurrent: () => setPicked(null),
    set,
  };
}
