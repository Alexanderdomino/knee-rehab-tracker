import { describe, expect, it } from 'vitest';
import { addDays, dateRange, diffDays, isISODate, toISODate, weekStart, weekdayMon0 } from './dates';

describe('dates', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is not affected by DST transitions', () => {
    // EU DST ends 2026-10-25, US 2026-11-01
    expect(dateRange('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
  });

  it('builds inclusive ranges', () => {
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(dateRange('2026-03-02', '2026-03-01')).toEqual([]);
  });

  it('computes ISO week starts (Monday)', () => {
    expect(weekdayMon0('2026-10-05')).toBe(0); // Monday
    expect(weekStart('2026-10-04')).toBe('2026-09-28'); // Sunday → previous Monday
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
  });

  it('formats and validates local dates', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-1-01')).toBe(false);
  });
});
