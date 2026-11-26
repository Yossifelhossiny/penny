import type { CategorySpendingItem } from '../../services/insights';
import { Amount, CategoryIcon } from '../ui';

/** Ranked list of where money went this month. No pie: lengths compare better. */
export function CategoryBreakdown({ items, limit }: { items: CategorySpendingItem[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  const max = Math.max(1, ...shown.map((i) => i.amountPiastres));
  return (
    <ul className="space-y-4">
      {shown.map((item) => (
        <li key={item.categoryId} className="flex items-center gap-3">
          <CategoryIcon category={{ name: item.name, type: 'expense' }} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink truncate">{item.name}</span>
              <Amount piastres={item.amountPiastres} size="sm" hideFraction />
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="h-1.5 flex-1 rounded-full bg-well overflow-hidden">
                <div className="h-full rounded-full bg-grad-accent" style={{ width: `${Math.max(4, (item.amountPiastres / max) * 100)}%` }} />
              </div>
              <span className="num text-[11px] font-semibold text-ink-3 w-9 text-right">{Math.round(item.percentage)}%</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
