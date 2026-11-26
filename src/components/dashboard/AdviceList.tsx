import { AlertTriangle, ChevronRight, Info, OctagonAlert } from 'lucide-react';
import type { Advice } from '../../services/advice';
import type { Page } from '../../types';
import { Card, cx } from '../ui';

const ICON = { high: OctagonAlert, medium: AlertTriangle, info: Info } as const;
const TONE = {
  high: 'bg-expense-soft text-expense',
  medium: 'bg-caution-soft text-caution',
  info: 'bg-brand-50 text-brand-600',
} as const;

/** Warnings with the guideline each one is based on. */
export function AdviceList({ items, onNavigate, showBasis = true }: { items: Advice[]; onNavigate: (p: Page) => void; showBasis?: boolean }) {
  return (
    <Card padded={false} className="py-1.5">
      {items.map((a) => {
        const Icon = ICON[a.severity];
        const body = (
          <>
            <span className={cx('size-10 rounded-[13px] flex items-center justify-center shrink-0', TONE[a.severity])}>
              <Icon className="size-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-ink">{a.title}</span>
              <span className="block text-[13px] text-ink-2 mt-0.5">{a.detail}</span>
              {showBasis && a.basis && <span className="block text-[12px] text-ink-3 mt-1">{a.basis}</span>}
            </span>
            {a.action && <ChevronRight className="size-4 text-ink-4 mt-3 shrink-0" />}
          </>
        );
        return a.action ? (
          <button key={a.id} type="button" onClick={() => onNavigate(a.action!.page)} className="w-full flex items-start gap-3.5 px-4 py-3 text-left hover:bg-brand-50/60 transition-colors">
            {body}
          </button>
        ) : (
          <div key={a.id} className="flex items-start gap-3.5 px-4 py-3">
            {body}
          </div>
        );
      })}
    </Card>
  );
}
