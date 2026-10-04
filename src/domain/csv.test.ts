import { describe, expect, it } from 'vitest';
import { csvEscape, dailyCsv, entriesCsv } from './csv';
import { entry, loadEntry, series } from './testUtils';

describe('CSV export', () => {
  it('has one row per calendar day with zero-filled days across a month boundary', () => {
    const s = series(
      [{ date: '2026-02-27', pain: 3 }],
      [loadEntry('2026-03-02', 120, { notes: 'easy, "flat" ride' })],
      '2026-03-03',
    );
    const lines = dailyCsv(s).trim().split('\r\n');
    expect(lines).toHaveLength(1 + 5);
    expect(lines[0].startsWith('date,logged,daily_pain,pain_source,session_load')).toBe(true);
    expect(lines[1]).toBe('2026-02-27,yes,3,daily,0,0,0,0,0,,,,,');
    expect(lines[2]).toBe('2026-02-28,no,0,not_logged,0,0,0,0,0,,,,,');
    expect(lines[3]).toBe('2026-03-01,no,0,not_logged,0,0,0,0,0,,,,,');
    expect(lines[4]).toBe('2026-03-02,yes,0,not_logged,120,120,0,0,1,Cycling,,,none,"easy, ""flat"" ride"');
    expect(lines[5]).toBe('2026-03-03,no,0,not_logged,0,0,0,0,0,,,,,');
  });

  it('exports entry detail', () => {
    const csv = entriesCsv([
      entry('2026-03-02', {
        activityName: 'Rehab', kind: 'strength', durationMin: 45, rpe: 6,
        exercises: [{ name: 'Squat', sets: 3, reps: 10, loadKg: 40 }], painDuring: 2,
      }),
    ]);
    expect(csv.split('\r\n')[1]).toBe('2026-03-02,Rehab,strength,45,,6,270,1200,Squat 3x10@40kg,2,,none,');
  });

  it('escapes special characters', () => {
    expect(csvEscape('a\nb')).toBe('"a\nb"');
    expect(csvEscape(null)).toBe('');
  });
});
