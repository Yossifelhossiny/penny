import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'plain';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-grad-primary text-white shadow-raised hover:brightness-[1.06] active:brightness-95',
  secondary: 'bg-brand-100 text-brand-700 hover:bg-brand-200/70',
  ghost: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-expense-soft text-expense hover:bg-expense-soft/70',
  plain: 'bg-well text-ink-2 hover:bg-well-strong',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-sm gap-2 rounded-control',
  lg: 'h-[52px] px-6 text-[15px] gap-2 rounded-2xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, icon, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none',
        'transition-[filter,background-color,transform,opacity] duration-150 active:scale-[0.985]',
        'disabled:opacity-45 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'default' | 'brand' | 'danger';
  size?: 'sm' | 'md';
}

export function IconButton({ label, tone = 'default', size = 'md', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex items-center justify-center rounded-full transition-colors shrink-0',
        size === 'md' ? 'size-10' : 'size-8',
        tone === 'default' && 'text-ink-2 hover:bg-well',
        tone === 'brand' && 'bg-brand-100 text-brand-700 hover:bg-brand-200/70',
        tone === 'danger' && 'text-expense hover:bg-expense-soft',
        'disabled:opacity-40',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
