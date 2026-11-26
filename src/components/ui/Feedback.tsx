import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cx } from './cx';

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center text-center px-6 py-10', className)}>
      <div className="size-14 rounded-2xl bg-grad-soft text-brand-600 flex items-center justify-center mb-4 [&_svg]:size-6">
        {icon}
      </div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {message && <p className="text-sm text-ink-3 mt-1 max-w-[30ch]">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type BannerTone = 'info' | 'success' | 'warning' | 'error';
const bannerStyles: Record<BannerTone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-brand-50 text-brand-800', icon: <Info className="size-[18px] text-brand-600" /> },
  success: { box: 'bg-income-soft text-[#145c42]', icon: <CheckCircle2 className="size-[18px] text-income" /> },
  warning: { box: 'bg-caution-soft text-[#6f440f]', icon: <AlertTriangle className="size-[18px] text-caution" /> },
  error: { box: 'bg-expense-soft text-[#8a2f3d]', icon: <XCircle className="size-[18px] text-expense" /> },
};

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const s = bannerStyles[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-2xl px-4 py-3.5 text-sm', s.box, className)}>
      <span className="shrink-0 mt-px">{s.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title ? 'mt-0.5' : '', 'opacity-90')}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brand' | 'income' | 'expense' | 'warning'; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap',
        tone === 'neutral' && 'bg-well text-ink-3',
        tone === 'brand' && 'bg-brand-100 text-brand-700',
        tone === 'income' && 'bg-income-soft text-income',
        tone === 'expense' && 'bg-expense-soft text-expense',
        tone === 'warning' && 'bg-caution-soft text-caution',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Progress bar: brand gradient while healthy, warmer as it fills up. */
export function ProgressBar({ value, className, tone }: { value: number; className?: string; tone?: 'auto' | 'brand' }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill =
    tone === 'brand' || value < 80 ? 'bg-grad-accent' : value <= 100 ? 'bg-[#e0a03d]' : 'bg-expense-500';
  return (
    <div className={cx('h-2 rounded-full bg-well overflow-hidden', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-xl', className)} aria-hidden />;
}
