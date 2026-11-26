import type { ReactNode } from 'react';
import { cx } from './cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

/** Pill-style segmented control. The selected segment lifts onto white. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex p-1 bg-well rounded-[14px] gap-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-[11px] font-semibold transition-all',
              size === 'md' ? 'h-10 text-sm' : 'h-8 text-[13px]',
              active ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(36_33_43/0.08)]' : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal filter chips. */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-9 px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1.5',
              active ? 'bg-ink text-white' : 'bg-surface text-ink-2 shadow-card hover:text-ink'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
