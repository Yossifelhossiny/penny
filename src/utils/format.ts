/**
 * Convert piastres (integer) to EGP display string.
 * All internal amounts are stored as piastres to avoid float errors.
 */
export function formatEGP(piastres: number): string {
  const egp = piastres / 100;
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(egp);
}

/**
 * Convert an EGP amount (user input) to piastres (integer).
 */
export function toPiastres(egp: number): number {
  return Math.round(egp * 100);
}

/**
 * Convert piastres to EGP number for display/input fields.
 */
export function toEGP(piastres: number): number {
  return piastres / 100;
}

/**
 * Format a Date to a readable string.
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Format a Date to a time string.
 */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-EG', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Get the start and end of a given month.
 */
export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

/**
 * Format a Date as a local "YYYY-MM-DD" string (for <input type="date">,
 * file names and CSV). Unlike toISOString(), this uses the device's time
 * zone, so dates don't shift by the UTC offset (2–3 hours in Egypt).
 */
export function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Format a Date as a local "YYYY-MM-DDTHH:mm" string for
 * <input type="datetime-local">.
 */
export function toLocalDateTimeInput(d: Date): string {
  return `${toLocalDateInput(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Parse a "YYYY-MM-DD" string from <input type="date"> as local midnight.
 * (new Date("YYYY-MM-DD") would parse it as UTC midnight instead.)
 */
export function parseLocalDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole pounds with grouping, no currency or decimals — for tight summary tiles. */
export function formatWhole(piastres: number): string {
  return Math.round(piastres / 100).toLocaleString('en-US');
}
