import { describe, expect, it } from 'vitest';
import { firstLogDate, pointAt } from './series';
import { entry, loadEntry, pains, series, strengthEntry } from './testUtils';

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
    expect(gap).toMatchObject({ logged: false, pain: 0, painLogged: false, strengthLoad: 0, cardioLoad: 0, dailyPain: null });
    expect(s[0]).toMatchObject({ logged: true, pain: 3, painLogged: true, cardioLoad: 0 });
    expect(s[4]).toMatchObject({ logged: true, pain: 0, painLogged: false, cardioLoad: 100 });
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
    expect(s.reduce((a, p) => a + p.cardioLoad, 0)).toBe(50);
    expect(firstLogDate([], [])).toBeNull();
  });

  it('aggregates multiple entries on a day', () => {
    const s = series([], [
      entry('2026-06-01', { durationMin: 30, painDuring: 2, swelling: 'mild', distanceKm: 10 }),
      entry('2026-06-01', {
        activityTypeId: 'rehab', activityName: 'Rehab', kind: 'strength', durationMin: 45,
        exercises: [
          { name: 'Squat', sets: 3, reps: 10, loadKg: 40 },
          { name: 'Iso leg extension', sets: 4, reps: 0, loadKg: 20, holdSec: 45 },
        ],
        painDuring: 3, painNextMorning: 4,
      }),
      strengthEntry('2026-06-01', 100, { exercises: [{ name: 'Squat', sets: 1, reps: 10, loadKg: 10 }] }),
    ], '2026-06-01');
    expect(s[0]).toMatchObject({
      strengthLoad: 1200 + 1200 + 100, cardioLoad: 30, distanceKm: 10, entryCount: 3,
      maxSessionPain: 3, nextMorningPain: 4, swelling: 'mild', pain: 3, painLogged: true,
    });
    // strength durations are not load
    expect(s[0].cardioByType).toEqual({ Cycling: 30 });
    expect(s[0].tonnageByExercise).toEqual({ Squat: 1300, 'Iso leg extension': 1200 });
  });

  it('weights cardio by the knee factor from settings and keeps raw minutes', () => {
    const entries = [
      loadEntry('2026-06-02', 210, { activityTypeId: 'kitesurfing', activityName: 'Kitesurfing' }),
      loadEntry('2026-06-02', 60, { activityTypeId: 'walking', activityName: 'Walking' }),
    ];
    const withDefaults = series([], entries, '2026-06-02');
    expect(withDefaults[0]).toMatchObject({ cardioMinutes: 270, cardioLoad: 420 + 30 });
    expect(withDefaults[0].cardioByType).toEqual({ Kitesurfing: 420, Walking: 30 });
    const custom = series([], entries, '2026-06-02', undefined, [
      { id: 'kitesurfing', name: 'Kitesurfing', kind: 'cardio', kneeFactor: 3 },
      { id: 'walking', name: 'Walking', kind: 'cardio', kneeFactor: 1 },
    ]);
    expect(custom[0].cardioLoad).toBe(630 + 60);
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
