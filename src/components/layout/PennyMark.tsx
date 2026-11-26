import { useId } from 'react';

/** Penny's mark: a violet coin with a lowercase "p" cut from its face. */
export function PennyMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Penny">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9678ED" />
          <stop offset="0.55" stopColor="#7253D6" />
          <stop offset="1" stopColor="#5034A8" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#g${id})`} />
      <path
        d="M18 35V20.5a6.5 6.5 0 1 1 6.5 6.5H21"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
