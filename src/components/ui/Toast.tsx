import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

type Kind = 'success' | 'error';
interface Item { id: number; kind: Kind; message: string }
let seq = 0;

/** Lightweight toasts that sit just above the tab bar. */
export function useToasts() {
  const [items, setItems] = useState<Item[]>([]);
  const show = useCallback((message: string, kind: Kind = 'success') => {
    const id = ++seq;
    setItems((p) => [...p, { id, kind, message }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 3800);
  }, []);
  const node = createPortal(
    <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-5 pointer-events-none" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="max-w-md w-full flex items-start gap-2.5 rounded-2xl bg-ink text-white px-4 py-3 text-sm font-medium shadow-[0_12px_32px_-12px_rgb(36_33_43/0.5)] animate-sheet-in">
          {t.kind === 'success' ? <CheckCircle2 className="size-[18px] text-[#8fe0bd] shrink-0" /> : <XCircle className="size-[18px] text-[#ffb3bd] shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>,
    document.body
  );
  return { show, node };
}
