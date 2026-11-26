import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export function Card({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cx('bg-surface rounded-card shadow-card', padded && 'p-5', className)} {...rest} />;
}

/** A titled block on a page. Titles are quiet labels; content carries the weight. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('space-y-3', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-1 min-h-6">
          {title && <h2 className="text-[13px] font-semibold text-ink-3 tracking-wide">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  leading,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 pt-2">
      <div className="flex items-start gap-1 min-w-0">
        {leading}
        <div className="min-w-0">
          <h1 className="text-[26px] leading-8 font-bold tracking-[-0.02em] text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-ink-3 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0 pt-0.5">{actions}</div>}
    </header>
  );
}
