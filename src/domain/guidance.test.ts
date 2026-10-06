import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { evaluateGuidance, statusTimeline, suggestTarget, type RuleId } from './guidance';
import { entry, loadEntry, pains, series, settings, strengthEntry } from './testUtils';
import type { DayLog, Entry, LoadStream, Settings } from './types';

const TODAY = '2026-10-04';
const daysAgo = (n: number) => addDays(TODAY, -n);

/** Pain values ending today: last element is today. */
const painsEndingToday = (values: (number | null)[]): DayLog[] => pains(daysAgo(values.length - 1), values);

function run(days: DayLog[], entries: Entry[] = [], s: Partial<Settings> = {}) {
  return evaluateGuidance(series(days, entries, TODAY), settings(s));
}

/** State of a rule; load rules are looked up for `stream` (default cardio, which `loadEntry` produces). */
const state = (g: ReturnType<typeof run>, id: RuleId, stream: LoadStream = 'cardio') =>
  g.checks.find((c) => c.id === id && (c.stream === undefined || c.stream === stream))!.state;

/** Daily constant load for `n` days ending today. */
const dailyLoad = (n: number, load: number | ((i: number) => number)): Entry[] =>
  Array.from({ length: n }, (_, i) =>
    loadEntry(daysAgo(n - 1 - i), typeof load === 'number' ? load : load(i)),
  );

describe('RED: pain above threshold', () => {
  it('does not fire at the threshold and fires above it', () => {
    expect(state(run(painsEndingToday([5])), 'pain-over-threshold')).toBe('ok');
    const g = run(painsEndingToday([6]));
    expect(state(g, 'pain-over-threshold')).toBe('fired');
    expect(g.status).toBe('RED');
  });

  it('fires on session pain during', () => {
    const g = run(painsEndingToday([1]), [entry(TODAY, { painDuring: 6 })]);
    expect(state(g, 'pain-over-threshold')).toBe('fired');
    expect(state(run(painsEndingToday([1]), [entry(TODAY, { painDuring: 5 })]), 'pain-over-threshold')).toBe('ok');
  });

  it("fires on next-morning pain from yesterday's session", () => {
    const g = run(painsEndingToday([5, null]), [entry(daysAgo(1), { painNextMorning: 6 })]);
    expect(g.metrics.referenceDate).toBe(TODAY);
    expect(state(g, 'pain-over-threshold')).toBe('fired');
  });

  it("falls back to yesterday when today isn't logged yet", () => {
    const g = run(painsEndingToday([7, null]));
    expect(g.metrics.referenceDate).toBe(daysAgo(1));
    expect(state(g, 'pain-over-threshold')).toBe('fired');
    expect(g.reasons[0]).toContain('yesterday');
  });

  it('reports not enough data when nothing was logged today or yesterday', () => {
    const g = run(painsEndingToday([7, null, null]));
    expect(state(g, 'pain-over-threshold')).toBe('insufficient');
    expect(g.dataNotes.join(' ')).toContain('No pain logged today or yesterday');
  });

  it('respects a custom threshold', () => {
    expect(state(run(painsEndingToday([6]), [], { painThreshold: 6 }), 'pain-over-threshold')).toBe('ok');
    expect(state(run(painsEndingToday([4]), [], { painThreshold: 3 }), 'pain-over-threshold')).toBe('fired');
  });
});

describe('RED: next-morning pain jump', () => {
  it('fires at +2 and not at +1', () => {
    const fire = run(painsEndingToday([2, null]), [entry(daysAgo(1), { painNextMorning: 4 })]);
    expect(state(fire, 'next-morning-jump')).toBe('fired');
    expect(fire.status).toBe('RED');
    const ok = run(painsEndingToday([2, null]), [entry(daysAgo(1), { painNextMorning: 3 })]);
    expect(state(ok, 'next-morning-jump')).toBe('ok');
  });

  it('is not enough data without a next-morning value or previous daily pain', () => {
    expect(state(run(painsEndingToday([2, 1])), 'next-morning-jump')).toBe('insufficient');
    const noDaily = run(painsEndingToday([2, null, null]), [entry(daysAgo(1), { painNextMorning: 4 })]);
    expect(state(noDaily, 'next-morning-jump')).toBe('insufficient');
  });
});

describe('RED: amber or worse for 3 consecutive logged days', () => {
  it('fires on 3 logged amber days, even with unlogged gaps between them', () => {
    expect(state(run(painsEndingToday([3, 3, 3])), 'amber-3-days')).toBe('fired');
    expect(state(run(painsEndingToday([3, null, 4, null, 3])), 'amber-3-days')).toBe('fired');
  });

  it('does not fire if any of the last 3 logged days is green (boundary value 2)', () => {
    expect(state(run(painsEndingToday([3, 2, 3])), 'amber-3-days')).toBe('ok');
    expect(state(run(painsEndingToday([3, 3, 2])), 'amber-3-days')).toBe('ok');
  });

  it('needs 3 logged days', () => {
    expect(state(run(painsEndingToday([3, null, 3])), 'amber-3-days')).toBe('insufficient');
  });

  it('respects custom zone cut-offs', () => {
    expect(state(run(painsEndingToday([3, 3, 3]), [], { greenMax: 3 }), 'amber-3-days')).toBe('ok');
  });
});

describe('RED: moderate swelling', () => {
  it('fires on moderate, not on mild', () => {
    expect(state(run(painsEndingToday([1]), [entry(TODAY, { swelling: 'moderate' })]), 'swelling-moderate')).toBe('fired');
    expect(state(run(painsEndingToday([1]), [entry(TODAY, { swelling: 'mild' })]), 'swelling-moderate')).toBe('ok');
  });
});

describe('RED: ACWR above upper limit', () => {
  // 21 days of a, then 7 days of b. b/a = 13/9 gives exactly ACWR 1.3.
  const acwrEntries = (a: number, b: number) => dailyLoad(28, (i) => (i < 21 ? a : b));

  it('does not fire at exactly the limit, fires above', () => {
    const at = run([], acwrEntries(189, 273));
    expect(at.metrics.streams.cardio.acwr).toBeCloseTo(1.3, 10);
    expect(state(at, 'acwr-high')).toBe('ok');
    const above = run([], acwrEntries(189, 274));
    expect(state(above, 'acwr-high')).toBe('fired');
    expect(above.status).toBe('RED');
  });

  it('needs 28 days of history', () => {
    const g = run([], dailyLoad(27, 100));
    expect(state(g, 'acwr-high')).toBe('insufficient');
    expect(g.metrics.streams.cardio.acwr).toBeNull();
    expect(g.dataNotes.join(' ')).toMatch(/needs 28 days/);
  });

  it('respects a custom upper limit', () => {
    expect(state(run([], acwrEntries(100, 200), { acwrUpper: 1.7 }), 'acwr-high')).toBe('ok');
  });
});

describe('AMBER: pain in amber zone today', () => {
  it('fires at the amber boundary (3), not at 2', () => {
    const g = run(painsEndingToday([3]));
    expect(state(g, 'pain-amber-today')).toBe('fired');
    expect(g.status).toBe('AMBER');
    expect(state(run(painsEndingToday([2])), 'pain-amber-today')).toBe('ok');
  });
  it('respects custom zones', () => {
    expect(state(run(painsEndingToday([3]), [], { greenMax: 3, amberMax: 6 }), 'pain-amber-today')).toBe('ok');
  });
});

describe('AMBER: week-over-week load increase', () => {
  // prev window = 13..7 days ago, last window = 6..0 days ago
  const wow = (prev: number, curr: number, s: Partial<Settings> = {}) =>
    run(painsEndingToday([1]), [loadEntry(daysAgo(13), prev), loadEntry(daysAgo(3), curr)], s);

  it('does not fire at exactly +10%, fires above', () => {
    const at = wow(1000, 1100);
    expect(at.metrics.streams.cardio.wowPct).toBeCloseTo(10);
    expect(state(at, 'wow-increase')).toBe('ok');
    const above = wow(1000, 1101);
    expect(state(above, 'wow-increase')).toBe('fired');
    expect(above.status).toBe('AMBER');
  });

  it('needs 14 days of history and a non-zero previous week', () => {
    expect(state(run(painsEndingToday([1]), [loadEntry(daysAgo(12), 100)]), 'wow-increase')).toBe('insufficient');
    const zeroPrev = run([{ date: daysAgo(13), pain: 1 }, { date: TODAY, pain: 1 }], [loadEntry(daysAgo(2), 100)]);
    expect(state(zeroPrev, 'wow-increase')).toBe('insufficient');
  });

  it('respects a custom max increase', () => {
    expect(state(wow(1000, 1150, { maxWeeklyIncreasePct: 15 }), 'wow-increase')).toBe('ok');
    expect(state(wow(1000, 1150, { maxWeeklyIncreasePct: 14 }), 'wow-increase')).toBe('fired');
  });

  it('counts zero-filled days as 0 load', () => {
    // nothing logged at all in the previous window except the first-log day with 0 load → prev 0
    const g = run([{ date: daysAgo(13), pain: 0 }], [loadEntry(TODAY, 50)]);
    expect(g.metrics.streams.cardio.prev7).toBe(0);
  });
});

describe('AMBER: rising pain trend', () => {
  it('fires on any positive slope over the last 7 logged days', () => {
    const g = run(painsEndingToday([0, 0, 0, 0, 0, 0, 1]));
    expect(state(g, 'pain-trend-rising')).toBe('fired');
    expect(g.status).toBe('AMBER');
  });
  it('does not fire on a flat or falling trend', () => {
    expect(state(run(painsEndingToday([1, 1, 1, 1, 1, 1, 1])), 'pain-trend-rising')).toBe('ok');
    expect(state(run(painsEndingToday([2, 1, 1, 1, 1, 1, 0])), 'pain-trend-rising')).toBe('ok');
  });
  it('ignores zero-filled days and needs 7 logged days', () => {
    // Zero-filled gaps would pull the line down if counted; with 6 logged days it's insufficient.
    expect(state(run(painsEndingToday([2, null, 2, null, 2, null, 2, 2, 2])), 'pain-trend-rising')).toBe('insufficient');
    expect(state(run(painsEndingToday([2, null, 2, null, 2, null, 2, 2, 2, 2])), 'pain-trend-rising')).toBe('ok');
  });
});

describe('GREEN: progression requirements', () => {
  it('is GREEN after 7 logged green days with steady load', () => {
    const g = run(painsEndingToday([1, 1, 1, 1, 1, 1, 1]), dailyLoad(7, 150));
    expect(g.status).toBe('GREEN');
    expect(g.headline).toBe('OK to progress');
    expect(g.targets.map((t) => t.label)).toEqual(['1,155 knee-min']); // 1050 × 1.10
    // ACWR has too little data: GREEN, but says so
    expect(g.reasons.join(' ')).toMatch(/not enough data/);
  });

  it('zero-filled days do NOT count toward the green streak', () => {
    // 10 calendar days, only 6 logged (all green) → hold.
    const g = run(painsEndingToday([1, null, 1, null, 1, null, 1, null, 1, 1]));
    expect(state(g, 'green-streak')).toBe('insufficient');
    expect(g.status).toBe('AMBER');
    expect(g.reasons.join(' ')).toMatch(/6 logged days/);
  });

  it('days with entries but no pain score do not count toward the streak', () => {
    const g = run(painsEndingToday([1, 1, 1, 1, 1, 1, null]), [loadEntry(TODAY, 100)]);
    expect(state(g, 'green-streak')).toBe('insufficient');
  });

  it('requires all N logged days to be green', () => {
    const g = run(painsEndingToday([3, 1, 1, 1, 1, 1, 1]), [], { maxWeeklyIncreasePct: 100 });
    expect(state(g, 'green-streak')).toBe('fired');
    expect(state(g, 'pain-trend-rising')).toBe('ok');
    expect(g.status).toBe('AMBER');
  });

  it('respects a custom N', () => {
    expect(run(painsEndingToday([1, 1, 1]), [], { greenDaysRequired: 3 }).status).toBe('GREEN');
    expect(run(painsEndingToday([1, 1, 1]), [], { greenDaysRequired: 4 }).status).toBe('AMBER');
  });

  it('holds when ACWR is below the lower limit', () => {
    // 21 days at 100, then 7 days at 70 → ACWR 70/92.5 ≈ 0.76
    const entries = dailyLoad(28, (i) => (i < 21 ? 100 : 70));
    const g = run(painsEndingToday(Array(28).fill(1)), entries);
    expect(g.metrics.streams.cardio.acwr!).toBeLessThan(0.8);
    expect(state(g, 'acwr-in-range')).toBe('fired');
    expect(g.status).toBe('AMBER');
    expect(run(painsEndingToday(Array(28).fill(1)), entries, { acwrLower: 0.7 }).status).toBe('GREEN');
  });
});

describe('priority and targets', () => {
  it('RED beats AMBER', () => {
    // amber pain today (A1) + moderate swelling (R4)
    const g = run(painsEndingToday([4]), [entry(TODAY, { swelling: 'moderate' })]);
    expect(state(g, 'pain-amber-today')).toBe('fired');
    expect(g.status).toBe('RED');
    expect(g.reasons).toHaveLength(1);
    expect(g.reasons[0]).toMatch(/swelling/i);
  });

  it('AMBER beats GREEN', () => {
    const g = run(painsEndingToday([1, 1, 1, 1, 1, 1, 1]), [loadEntry(daysAgo(13), 100), loadEntry(TODAY, 200)]);
    expect(state(g, 'green-streak')).toBe('ok');
    expect(state(g, 'wow-increase')).toBe('fired');
    expect(g.status).toBe('AMBER');
  });

  it('suggests a concrete reduction range on RED', () => {
    const g = run(painsEndingToday([7]), dailyLoad(7, 1000 / 7));
    expect(g.targets).toHaveLength(1);
    expect(g.targets[0]).toMatchObject({ stream: 'cardio', base: 1000, min: 700, max: 800, label: '700–800 knee-min' });
    const custom = run(painsEndingToday([7]), dailyLoad(7, 1000 / 7), { reductionMinPct: 10, reductionMaxPct: 10 });
    expect(custom.targets[0].label).toBe('900 knee-min');
  });

  it('holds load on AMBER and progresses by the custom % on GREEN', () => {
    const s = series(painsEndingToday([1]), dailyLoad(7, 100), TODAY);
    expect(suggestTarget('AMBER', s, settings(), 'cardio').label).toBe('700 knee-min');
    expect(suggestTarget('GREEN', s, settings({ progressionPct: 5 }), 'cardio').label).toBe('735 knee-min');
  });

  it('uses the 4-week average when the last 7 days had no load', () => {
    const entries = dailyLoad(28, (i) => (i < 21 ? 100 : 0));
    const s = series([], entries.filter((e) => (e.durationMin ?? 0) > 0), TODAY, daysAgo(27));
    expect(suggestTarget('AMBER', s, settings(), 'cardio').base).toBe(525); // 2100/28*7
  });

  it('handles an empty series', () => {
    const g = evaluateGuidance([], settings());
    expect(g.status).toBe('AMBER');
    expect(g.targets).toEqual([]);
  });
});

describe('strength load stream (tonnage)', () => {
  it('week-over-week rule fires on strength tonnage independently of cardio', () => {
    const g = run(painsEndingToday([1]), [
      strengthEntry(daysAgo(13), 1000),
      strengthEntry(daysAgo(3), 1110),
      loadEntry(daysAgo(13), 60),
      loadEntry(daysAgo(3), 60),
    ]);
    expect(state(g, 'wow-increase', 'strength')).toBe('fired');
    expect(state(g, 'wow-increase', 'cardio')).toBe('ok');
    expect(g.metrics.streams.strength.wowPct).toBeCloseTo(11);
    expect(g.status).toBe('AMBER');
    expect(g.reasons.join(' ')).toMatch(/Strength load over the last 7 days \(1,110 kg\)/);
    expect(state(run(painsEndingToday([1]), [strengthEntry(daysAgo(13), 1000), strengthEntry(daysAgo(3), 1100)]), 'wow-increase', 'strength')).toBe('ok');
  });

  it('ACWR is computed per stream', () => {
    const entries = dailyLoad(28, () => 30) // steady cardio
      .concat(Array.from({ length: 28 }, (_, i) => strengthEntry(daysAgo(27 - i), i < 21 ? 1000 : 2000)));
    const g = run([], entries);
    expect(g.metrics.streams.cardio.acwr).toBeCloseTo(1);
    expect(g.metrics.streams.strength.acwr).toBe(1.6);
    expect(state(g, 'acwr-high', 'strength')).toBe('fired');
    expect(state(g, 'acwr-high', 'cardio')).toBe('ok');
    expect(g.status).toBe('RED');
  });

  it('a stream you never use does not block progression', () => {
    // 28 days of green pain and steady strength work, no cardio at all
    const g = run(painsEndingToday(Array(28).fill(1)), Array.from({ length: 28 }, (_, i) => strengthEntry(daysAgo(27 - i), 500)));
    expect(state(g, 'acwr-high', 'cardio')).toBe('ok');
    expect(g.checks.some((c) => c.stream === 'cardio' && c.state === 'insufficient')).toBe(false);
    expect(g.status).toBe('GREEN');
    expect(g.targets.map((t) => t.label)).toEqual(['3,850 kg']); // 3500 × 1.10
  });

  it('gives one target per stream, kg rounded to 10', () => {
    const g = run(painsEndingToday([7]), [strengthEntry(TODAY, 4213), loadEntry(TODAY, 100)]);
    expect(g.targets.map((t) => [t.stream, t.label])).toEqual([
      ['strength', '2,950–3,370 kg'],
      ['cardio', '70–80 knee-min'],
    ]);
  });
});

describe('knee-load factor', () => {
  it('3.5 h of kitesurfing counts as more load than the same time walking', () => {
    const kite = { activityTypeId: 'kitesurfing', activityName: 'Kitesurfing' };
    const walk = { activityTypeId: 'walking', activityName: 'Walking' };
    // Previous week: 210 min walking (×0.5 = 105). This week: 210 min kiting (×2 = 420).
    const g = run(painsEndingToday([1]), [loadEntry(daysAgo(13), 210, walk), loadEntry(daysAgo(1), 210, kite)]);
    expect(g.metrics.streams.cardio.prev7).toBe(105);
    expect(g.metrics.streams.cardio.last7).toBe(420);
    expect(state(g, 'wow-increase', 'cardio')).toBe('fired');
    expect(g.reasons.join(' ')).toMatch(/420 knee-min/);
    // The same minutes on both weeks with equal factors would be flat:
    const flat = run(painsEndingToday([1]), [loadEntry(daysAgo(13), 210, kite), loadEntry(daysAgo(1), 210, kite)]);
    expect(state(flat, 'wow-increase', 'cardio')).toBe('ok');
  });
});

describe('status timeline', () => {
  it('records each status change with reasons', () => {
    const tl = statusTimeline(series(pains('2026-01-01', [1, 1, 1, 7, 1, 1, 1]), [], '2026-01-07'), settings({ greenDaysRequired: 3 }));
    expect(tl.map((c) => [c.date, c.status])).toEqual([
      ['2026-01-01', 'AMBER'],
      ['2026-01-03', 'GREEN'],
      ['2026-01-04', 'RED'],
      ['2026-01-05', 'AMBER'],
      ['2026-01-07', 'GREEN'],
    ]);
    expect(tl[2].from).toBe('GREEN');
    expect(tl[2].reasons[0]).toMatch(/above your pain threshold/);
  });
});
