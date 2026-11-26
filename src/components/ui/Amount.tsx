import { cx } from './cx';
import { amountParts } from './amountParts';

export type AmountTone = 'income' | 'expense' | 'transfer' | 'neutral' | 'inverse';

/**
 * A money figure. Currency and decimals are set smaller and quieter than the
 * whole number so large balances read at a glance.
 */
export function Amount({
  piastres,
  tone = 'neutral',
  signed = false,
  size = 'md',
  className,
  hideFraction,
}: {
  piastres: number;
  tone?: AmountTone;
  /** Prefix + for income and − for expense. */
  signed?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'display';
  className?: string;
  hideFraction?: boolean;
}) {
  const { negative, whole, fraction } = amountParts(piastres);
  let sign = negative ? '−' : '';
  if (signed && !negative) sign = tone === 'income' ? '+' : tone === 'expense' ? '−' : '';

  const color = {
    income: 'text-income',
    expense: 'text-ink',
    transfer: 'text-ink-2',
    neutral: 'text-ink',
    inverse: 'text-white',
  }[tone];

  const sizes = {
    sm: { main: 'text-sm', minor: 'text-[11px]', gap: 'gap-[3px]' },
    md: { main: 'text-[15px]', minor: 'text-xs', gap: 'gap-1' },
    lg: { main: 'text-xl', minor: 'text-sm', gap: 'gap-1' },
    xl: { main: 'text-[28px] tracking-[-0.025em]', minor: 'text-base', gap: 'gap-1.5' },
    display: { main: 'text-[40px] leading-none tracking-[-0.035em]', minor: 'text-lg', gap: 'gap-1.5' },
  }[size];

  return (
    <span className={cx('num inline-flex items-baseline font-bold whitespace-nowrap', sizes.gap, color, className)}>
      <span className={cx(sizes.minor, 'font-semibold opacity-60')}>EGP</span>
      <span className={sizes.main}>
        {sign}
        {whole}
        {!hideFraction && <span className="opacity-55 font-semibold">.{fraction}</span>}
      </span>
    </span>
  );
}
