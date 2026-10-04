import { describe, expect, it } from 'vitest';
import { firstLogDate, pointAt } from './series';
import { entry, loadEntry, pains, series } from './testUtils';

describe('buildDailySeries gap filling', () => {
  it('returns an empty series with no data', () => {
    expect(series([], [], '2026-10-04')).toEqual([]);
  });

  it('fills every calendar day from first log to end with pain 0 / volume 0', () => {
    const s = series([{ date: '2026-01-29', pain: 3 }], [loadEntry('2026-02-02', 100)], '2026-02-03');
    expect(s.map((p) => p.date)).toEqual([
      '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02', '2026-02-03',
    ]);
    const gap = s[1];
    expect(gap).toMatchObject({ logged: false, pain: 0, painLogged: false, load: 0, tonnage: 0, dailyPain: null });
    expect(s[0]).toMatchObject({ logged: true, pain: 3, painLogged: true, load: 0 });
    expect(s[4]).toMatchObject({ logged: true, pain: 0, painLogged: false, load: 100 });
  });

  it('distinguishes a logged 0 from a zero-filled day', () => {
    const s = series(pains('2026-03-30', [0, null, 0]), [], '2026-04-01');
    expect(s.map((p) => [p.pain, p.painLogged, p.logged])).toEqual([
      [0, true, true],
      [0, false, false],
      [0, true, true],
    ]);
  });

  it('starts at the earliest of days/entries and ignores data after the end date', () => {
    const s = series([{ date: '2026-05-10', pain: 1 }], [loadEntry('2026-05-08', 50), loadEntry('2026-05-20', 99)], '2026-05-11');
    expect(s[0].date).toBe('2026-05-08');
    expect(s.at(-1)!.date).toBe('2026-05-11');
    expect(s.reduce((a, p) => a + p.load, 0)).toBe(50);
    expect(firstLogDate([], [])).toBeNull();
  });

  it('aggregates multiple entries on a day', () => {
    const s = series([], [
      entry('2026-06-01', { durationMin: 30, rpe: 4, painDuring: 2, swelling: 'mild', distanceKm: 10 }),
      entry('2026-06-01', {
        activityTypeId: 'rehab', activityName: 'Rehab', kind: 'strength', durationMin: 45, rpe: 6,
        exercises: [{ name: 'Squat', sets: 3, reps: 10, loadKg: 40 }], painDuring: 3, painNextMorning: 4,
      }),
    ], '2026-06-01');
    expect(s[0]).toMatchObject({
      load: 120 + 270, tonnage: 1200, durationMin: 75, distanceKm: 10, entryCount: 2,
      maxSessionPain: 3, nextMorningPain: 4, swelling: 'mild', pain: 3, painLogged: true,
    });
    expect(s[0].loadByType).toEqual({ Cycling: 120, Rehab: 270 });
  });

  it('daily score takes precedence over session pain', () => {
    const s = series([{ date: '2026-06-01', pain: 1 }], [entry('2026-06-01', { painDuring: 4 })], '2026-06-01');
    expect(s[0].pain).toBe(1);
  });

  it('pointAt finds a date or returns null', () => {
    const s = series(pains('2026-02-27', [1, 2, 3]), [], '2026-03-01');
    expect(pointAt(s, '2026-03-01')!.pain).toBe(3);
    expect(pointAt(s, '2026-03-02')).toBeNull();
  });
});
