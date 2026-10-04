import { describe, expect, it } from 'vitest';
import {
  acwrSeries, greenStreaks, linearSlope, loadVsNextDayPain, pctChange, rollingAverage, weeklySummaries, windowLoad,
} from './aggregate';
import { loadEntry, pains, series, settings } from './testUtils';

describe('weekly aggregation', () => {
  // Thu 2026-01-29 .. Tue 2026-02-10 spans a month boundary and three ISO weeks.
  const s = series(
    [{ date: '2026-01-29', pain: 4 }, { date: '2026-02-03', pain: 6 }, { date: '2026-02-09', pain: 1 }],
    [loadEntry('2026-01-29', 100), loadEntry('2026-02-01', 200), loadEntry('2026-02-02', 300), loadEntry('2026-02-10', 330)],
    '2026-02-10',
  );
  const weeks = weeklySummaries(s, settings());

  it('groups by ISO week across a month boundary and sums load', () => {
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-01-26', '2026-02-02', '2026-02-09']);
    expect(weeks.map((w) => w.totalLoad)).toEqual([300, 300, 330]);
    expect(weeks.map((w) => w.daysInRange)).toEqual([4, 7, 2]);
  });

  it('counts zero-filled days as pain 0 in averages and as not logged', () => {
    // Week 1: Thu 4, Fri 0, Sat 0, Sun(entry, no pain) 0 → 4/4
    expect(weeks[0].avgPain).toBe(1);
    expect(weeks[0].daysLogged).toBe(2);
    // Week 2: only Mon (entry) and Tue (pain 6) logged → 6/7
    expect(weeks[1].avgPain).toBeCloseTo(6 / 7);
    expect(weeks[1].daysLogged).toBe(2);
    expect(weeks[1].maxPain).toBe(6);
    expect(weeks[1].daysOverThreshold).toBe(1);
    expect(weeks[2].avgPain).toBe(0.5);
  });

  it('computes week-over-week % change', () => {
    expect(weeks.slice(0, 2).map((w) => w.wowPct)).toEqual([null, 0]);
    expect(weeks[2].wowPct).toBeCloseTo(10);
  });

  it('breaks load down by activity type', () => {
    expect(weeks[0].loadByType).toEqual({ Cycling: 300 });
  });

  it('pctChange is null when the previous value is 0', () => {
    expect(pctChange(0, 100)).toBeNull();
    expect(pctChange(200, 150)).toBe(-25);
  });
});

describe('rolling averages and ACWR', () => {
  it('rollingAverage returns null until the window is full', () => {
    expect(rollingAverage([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(rollingAverage([7, 7, 7], 7)).toEqual([null, null, null]);
  });

  it('uses zero-filled days in the rolling windows', () => {
    // load 280 on day 1, nothing logged for the next 6 days except day 7 pain
    const s = series([{ date: '2026-03-07', pain: 1 }], [loadEntry('2026-03-01', 280)], '2026-03-07');
    expect(s).toHaveLength(7);
    expect(acwrSeries(s).at(-1)!.acute).toBe(40);
  });

  it('computes acute (7d), chronic (28d) and ACWR', () => {
    const entries = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(Date.UTC(2026, 1, 1 + i)).toISOString().slice(0, 10);
      entries.push(loadEntry(d, i < 21 ? 100 : 200));
    }
    const pts = acwrSeries(series([], entries, '2026-02-28'));
    expect(pts[26].chronic).toBeNull();
    expect(pts[26].acwr).toBeNull();
    const last = pts.at(-1)!;
    expect(last.acute).toBe(200);
    expect(last.chronic).toBe(125);
    expect(last.acwr).toBe(1.6);
  });

  it('ACWR is null when chronic load is 0', () => {
    const s = series(pains('2026-01-01', Array(28).fill(1)), [], '2026-01-28');
    expect(acwrSeries(s).at(-1)!.acwr).toBeNull();
  });

  it('windowLoad returns null when the window leaves the series', () => {
    const s = series([], [loadEntry('2026-01-01', 10), loadEntry('2026-01-03', 5)], '2026-01-03');
    expect(windowLoad(s, 2, 3)).toBe(15);
    expect(windowLoad(s, 2, 4)).toBeNull();
  });

  it('linearSlope', () => {
    expect(linearSlope([{ x: 0, y: 1 }, { x: 1, y: 3 }])).toBe(2);
    expect(linearSlope([{ x: 0, y: 1 }])).toBeNull();
  });
});

describe('green streaks', () => {
  it('skips not-logged days (neither count nor break) and resets on non-green', () => {
    const s = series(pains('2026-01-01', [1, 2, null, null, 0, 4, 1, null, 2]), [], '2026-01-09');
    expect(greenStreaks(s, settings())).toEqual({ current: 2, longest: 3 });
  });
  it('respects custom zones', () => {
    const s = series(pains('2026-01-01', [3, 3, 3]), [], '2026-01-03');
    expect(greenStreaks(s, settings({ greenMax: 3, amberMax: 6 }))).toEqual({ current: 3, longest: 3 });
  });
});

describe('load vs next-day pain', () => {
  it('pairs load with next-day pain and ignores pairs with an unlogged next day', () => {
    const s = series(
      pains('2026-01-01', [1, 1, 4, null, 1, 2]),
      [loadEntry('2026-01-01', 200), loadEntry('2026-01-02', 500), loadEntry('2026-01-03', 300), loadEntry('2026-01-05', 250)],
      '2026-01-06',
    );
    const t = loadVsNextDayPain(s, settings());
    // 01-03 → 01-04 not logged: skipped. 01-04 (0 load) → 01-05 pain 1
    expect(t.points.map((p) => [p.load, p.nextDayPain])).toEqual([[200, 1], [500, 4], [0, 1], [250, 2]]);
    expect(t.greenRange).toEqual({ min: 0, max: 250 });
    expect(t.safeUpTo).toBe(250);
  });
});
