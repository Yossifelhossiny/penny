import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { cx } from './cx';

interface SheetProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Sticky area at the bottom (primary action). */
  footer?: ReactNode;
  description?: ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Bottom sheet on phones, centered dialog on wider screens.
 * Closes on backdrop tap and Escape; locks page scroll while open.
 */
export function Sheet({ title, onClose, children, footer, description, size = 'md' }: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'relative w-full bg-surface shadow-sheet animate-sheet-in flex flex-col',
          'rounded-t-[28px] sm:rounded-[28px] max-h-[92dvh]',
          size === 'md' ? 'sm:max-w-md' : 'sm:max-w-lg'
        )}
      >
        <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-well-strong" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5 pb-2">
          <div className="min-w-0 pt-1.5">
            <h2 id={titleId} className="text-lg font-bold tracking-[-0.01em] text-ink">{title}</h2>
            {description && <p className="text-sm text-ink-3 mt-0.5">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5 flex-1">{children}</div>
        {footer && (
          <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-surface rounded-b-[28px]">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Small confirm dialog used instead of window.confirm. */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onClose,
  busy,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-[15px] text-ink-2">{message}</p>
      <div className="grid grid-cols-2 gap-2.5 mt-6">
        <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-well text-ink-2 font-semibold text-[15px]">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={cx(
            'h-12 rounded-2xl font-semibold text-[15px] disabled:opacity-50',
            tone === 'danger' ? 'bg-expense-500 text-white' : 'bg-grad-primary text-white'
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
