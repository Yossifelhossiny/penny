import { describe, it, expect } from 'vitest';
import { toLocalDateInput, toLocalDateTimeInput, parseLocalDateInput } from './format';

describe('local date helpers', () => {
  it('formats using local time, not UTC', () => {
    // 00:30 local on 1 Dec — in UTC+2 this is still 30 Nov in UTC
    const d = new Date(2026, 11, 1, 0, 30);
    expect(toLocalDateInput(d)).toBe('2026-12-01');
    expect(toLocalDateTimeInput(d)).toBe('2026-12-01T00:30');
  });

  it('round-trips a datetime-local value without shifting the time', () => {
    const d = new Date(2026, 10, 25, 20, 58);
    const again = new Date(toLocalDateTimeInput(d));
    expect(again.getTime()).toBe(d.getTime());
    // editing twice must not move it
    expect(new Date(toLocalDateTimeInput(again)).getTime()).toBe(d.getTime());
  });

  it('parses a date input as local midnight', () => {
    const d = parseLocalDateInput('2026-12-31');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 11, 31, 0]);
    expect(toLocalDateInput(d)).toBe('2026-12-31');
  });
});
