import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink-2 px-0.5">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[13px] text-expense px-0.5">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3 px-0.5">{hint}</p>
      ) : null}
    </div>
  );
}

const control =
  'w-full bg-well rounded-control px-4 h-12 text-[15px] text-ink placeholder:text-ink-4 outline-none ' +
  'transition-[box-shadow,background-color] focus:bg-surface focus:ring-2 focus:ring-brand-400/60 disabled:opacity-50';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cx(control, className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={cx(control, 'h-auto py-3 leading-relaxed resize-none', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref
) {
  return (
    <div className="relative">
      <select ref={ref} className={cx(control, 'appearance-none pr-10 cursor-pointer', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="size-4 text-ink-3 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
    </div>
  );
});

/** Large amount entry used at the top of money forms. */
export const AmountInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { tone?: 'income' | 'expense' | 'brand' }
>(function AmountInput({ className, tone = 'brand', ...rest }, ref) {
  const len = String(rest.value ?? '').length;
  return (
    <div className="flex items-baseline justify-center gap-2 py-3">
      <span className="text-lg font-semibold text-ink-3">EGP</span>
      <input
        ref={ref}
        style={{ width: `${Math.min(12, Math.max(1, len)) + 0.4}ch` }}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0.01"
        placeholder="0"
        className={cx(
          'num min-w-[1.4ch] bg-transparent text-center text-[44px] leading-tight font-bold tracking-[-0.03em] outline-none placeholder:text-ink-4',
          tone === 'income' && 'text-income',
          tone === 'expense' && 'text-ink',
          tone === 'brand' && 'text-ink',
          className
        )}
        {...rest}
      />
    </div>
  );
});

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-grad-primary' : 'bg-well-strong'
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 size-6 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}
