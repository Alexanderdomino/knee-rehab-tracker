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
    expect(lines[0].startsWith('date,logged,daily_pain,pain_source,strength_load_kg,cardio_min,cardio_load_knee_min,distance_km,entries')).toBe(true);
    expect(lines[1]).toBe('2026-02-27,yes,3,daily,0,0,0,0,0,,,,,');
    expect(lines[2]).toBe('2026-02-28,no,0,not_logged,0,0,0,0,0,,,,,');
    expect(lines[3]).toBe('2026-03-01,no,0,not_logged,0,0,0,0,0,,,,,');
    expect(lines[4]).toBe('2026-03-02,yes,0,not_logged,0,120,120,0,1,Cycling,,,none,"easy, ""flat"" ride"');
    expect(lines[5]).toBe('2026-03-03,no,0,not_logged,0,0,0,0,0,,,,,');
  });

  it('exports entry detail', () => {
    const csv = entriesCsv([
      entry('2026-03-02', {
        activityName: 'Rehab', kind: 'strength', durationMin: null,
        exercises: [
          { name: 'Squat', sets: 3, reps: 10, loadKg: 40 },
          { name: 'Iso leg extension', sets: 4, reps: 0, loadKg: 20, holdSec: 45 },
        ],
        painDuring: 2,
      }),
    ]);
    expect(csv.split('\r\n')[1]).toBe(
      '2026-03-02,Rehab,strength,,,2400,,,Squat 3x10@40kg; Iso leg extension 4x45s@20kg,2,,none,',
    );
  });

  it('weights cardio by knee factor: raw minutes and knee-minutes in separate columns', () => {
    const s = series([], [loadEntry('2026-03-02', 210, { activityTypeId: 'kitesurfing', activityName: 'Kitesurfing' })], '2026-03-02');
    expect(dailyCsv(s).split('\r\n')[1]).toBe('2026-03-02,yes,0,not_logged,0,210,420,0,1,Kitesurfing,,,none,');
    const types = [{ id: 'kitesurfing', name: 'Kitesurfing', kind: 'cardio' as const, kneeFactor: 2.5 }];
    expect(entriesCsv(s[0].entries, types).split('\r\n')[1]).toBe('2026-03-02,Kitesurfing,cardio,210,,,2.5,525,,,,none,');
  });

  it('escapes special characters', () => {
    expect(csvEscape('a\nb')).toBe('"a\nb"');
    expect(csvEscape(null)).toBe('');
  });
});
