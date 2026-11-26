import { createElement } from 'react';
import type { AccountType, Category } from '../../types';
import { ArrowLeftRight, accountLucide, categoryLucide } from './iconMap';
import { cx } from './cx';

type Size = 'sm' | 'md' | 'lg';
const box: Record<Size, string> = {
  sm: 'size-8 rounded-[10px] [&_svg]:size-4',
  md: 'size-11 rounded-[14px] [&_svg]:size-5',
  lg: 'size-14 rounded-2xl [&_svg]:size-6',
};

export function CategoryIcon({
  category,
  transfer,
  size = 'md',
  className,
}: {
  category?: Pick<Category, 'name' | 'type'> | null;
  transfer?: boolean;
  size?: Size;
  className?: string;
}) {
  const uncategorized = !transfer && (!category || /uncategor/i.test(category.name));
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center shrink-0',
        box[size],
        transfer ? 'bg-well text-ink-2' : uncategorized ? 'bg-caution-soft text-caution' : category?.type === 'income' ? 'bg-income-soft text-income' : 'bg-brand-50 text-brand-600',
        className
      )}
      aria-hidden
    >
      {createElement(transfer ? ArrowLeftRight : categoryLucide(category?.name, category?.type), { strokeWidth: 1.9 })}
    </span>
  );
}

export function AccountIcon({ type, size = 'md', className, inverse }: { type?: AccountType; size?: Size; className?: string; inverse?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center shrink-0',
        box[size],
        inverse ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-600',
        className
      )}
      aria-hidden
    >
      {createElement(accountLucide(type), { strokeWidth: 1.9 })}
    </span>
  );
}

