import type { ReactNode } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cx } from './cx';

/** A settings-style row: icon, label, optional detail, chevron or trailing control. */
export function ListRow({
  icon,
  label,
  detail,
  trailing,
  onClick,
  tone = 'default',
  busy,
  disabled,
}: {
  icon?: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  busy?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <>
      {icon && (
        <span
          className={cx(
            'size-9 rounded-xl flex items-center justify-center shrink-0 [&_svg]:size-[18px]',
            tone === 'danger' ? 'bg-expense-soft text-expense' : 'bg-brand-50 text-brand-600'
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className={cx('block text-[15px] font-semibold truncate', tone === 'danger' ? 'text-expense' : 'text-ink')}>{label}</span>
        {detail && <span className="block text-[13px] text-ink-3 mt-0.5">{detail}</span>}
      </span>
      {busy ? <Loader2 className="size-4 animate-spin text-ink-3" /> : trailing ?? (onClick && <ChevronRight className="size-4 text-ink-4" />)}
    </>
  );
  const cls = 'w-full flex items-center gap-3.5 px-4 py-3 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled || busy} className={cx(cls, 'hover:bg-brand-50/60 transition-colors disabled:opacity-50')}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}
