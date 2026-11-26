import { useEffect, useState } from 'react';

/**
 * The current date, kept fresh.
 *
 * A Home Screen web app on iPhone can stay suspended in memory for days. A
 * `new Date()` captured once at launch would keep saying "October" well into
 * November. This re-reads the clock whenever the app becomes visible or
 * focused again, and at every local midnight while it stays open.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      const now = new Date();
      setToday((prev) =>
        prev.getFullYear() === now.getFullYear() &&
        prev.getMonth() === now.getMonth() &&
        prev.getDate() === now.getDate()
          ? prev
          : now
      );
      schedule();
    };

    const schedule = () => {
      clearTimeout(timer);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 1000);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);

  return today;
}
