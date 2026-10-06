import { addDays, weekStart } from './dates';
import { painZone } from './settings';
import { streamValue, type DailyPoint } from './series';
import type { ISODate, LoadStream, Settings } from './types';

export interface WeekSummary {
  weekStart: ISODate;
  /** Number of calendar days of this week inside the series (≤ 7). */
  daysInRange: number;
  daysLogged: number;
  /** Strength tonnage (kg) for the week. */
  strengthLoad: number;
  /** Cardio load (knee-minutes) for the week. */
  cardioLoad: number;
  /** Week-over-week % change per stream; null if no previous week or its load was 0. */
  strengthWowPct: number | null;
  cardioWowPct: number | null;
  /** Average daily pain over days in range (zero-filled days count as 0). */
  avgPain: number;
  maxPain: number;
  daysOverThreshold: number;
  cardioByType: Record<string, number>;
  tonnageByExercise: Record<string, number>;
}

export function pctChange(prev: number, curr: number): number | null {
  if (!(prev > 0)) return null;
  return ((curr - prev) / prev) * 100;
}

export function weeklySummaries(series: DailyPoint[], settings: Settings): WeekSummary[] {
  const weeks: WeekSummary[] = [];
  let current: (WeekSummary & { painSum: number }) | null = null;
  const flush = () => {
    if (!current) return;
    const { painSum, ...w } = current;
    w.avgPain = w.daysInRange ? painSum / w.daysInRange : 0;
    weeks.push(w);
  };
  for (const p of series) {
    const ws = weekStart(p.date);
    if (!current || current.weekStart !== ws) {
      flush();
      current = {
        weekStart: ws,
        daysInRange: 0,
        daysLogged: 0,
        strengthLoad: 0,
        cardioLoad: 0,
        strengthWowPct: null,
        cardioWowPct: null,
        avgPain: 0,
        maxPain: 0,
        daysOverThreshold: 0,
        cardioByType: {},
        tonnageByExercise: {},
        painSum: 0,
      };
    }
    current.daysInRange += 1;
    if (p.logged) current.daysLogged += 1;
    current.strengthLoad += p.strengthLoad;
    current.cardioLoad += p.cardioLoad;
    current.painSum += p.pain;
    const dayMax = Math.max(p.pain, p.maxSessionPain ?? 0);
    current.maxPain = Math.max(current.maxPain, dayMax);
    if (dayMax > settings.painThreshold) current.daysOverThreshold += 1;
    for (const [k, v] of Object.entries(p.cardioByType)) {
      current.cardioByType[k] = (current.cardioByType[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(p.tonnageByExercise)) {
      current.tonnageByExercise[k] = (current.tonnageByExercise[k] ?? 0) + v;
    }
  }
  flush();
  for (let i = 1; i < weeks.length; i++) {
    // Only compare consecutive calendar weeks (always true for a continuous series).
    if (addDays(weeks[i - 1].weekStart, 7) === weeks[i].weekStart) {
      weeks[i].strengthWowPct = pctChange(weeks[i - 1].strengthLoad, weeks[i].strengthLoad);
      weeks[i].cardioWowPct = pctChange(weeks[i - 1].cardioLoad, weeks[i].cardioLoad);
    }
  }
  return weeks;
}

/**
 * Trailing simple moving average of `values` over `window` days.
 * Returns null where fewer than `window` values are available.
 */
export function rollingAverage(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

export const ACUTE_DAYS = 7;
export const CHRONIC_DAYS = 28;

export interface AcwrPoint {
  date: ISODate;
  acute: number | null;
  chronic: number | null;
  acwr: number | null;
}

/** Rolling 7-day (acute) and 28-day (chronic) average daily load of one stream, and their ratio. */
export function acwrSeries(series: DailyPoint[], stream: LoadStream): AcwrPoint[] {
  const loads = series.map((p) => streamValue(p, stream));
  const acute = rollingAverage(loads, ACUTE_DAYS);
  const chronic = rollingAverage(loads, CHRONIC_DAYS);
  return series.map((p, i) => {
    const a = acute[i];
    const c = chronic[i];
    return {
      date: p.date,
      acute: a,
      chronic: c,
      acwr: a !== null && c !== null && c > 0 ? a / c : null,
    };
  });
}

/** Sum of one stream's load over the `days` days ending at index `endIdx` (inclusive); null if out of range. */
export function windowLoad(series: DailyPoint[], endIdx: number, days: number, stream: LoadStream): number | null {
  const startIdx = endIdx - days + 1;
  if (startIdx < 0 || endIdx >= series.length) return null;
  let sum = 0;
  for (let i = startIdx; i <= endIdx; i++) sum += streamValue(series[i], stream);
  return sum;
}

/** Least-squares slope of y over x. Returns null with fewer than 2 points. */
export function linearSlope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export interface Streaks {
  current: number;
  longest: number;
}

/**
 * Streaks of consecutive pain-logged days in the green zone. Days without a pain
 * observation are skipped: they neither extend nor break a streak.
 */
export function greenStreaks(series: DailyPoint[], settings: Settings): Streaks {
  let run = 0;
  let longest = 0;
  for (const p of series) {
    if (!p.painLogged) continue;
    if (painZone(p.pain, settings) === 'green') {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return { current: run, longest };
}

export interface TolerancePoint {
  date: ISODate;
  load: number;
  nextDayPain: number;
}

export interface ToleranceSummary {
  points: TolerancePoint[];
  /** Min/max load among days followed by green next-day pain. */
  greenRange: { min: number; max: number } | null;
  /** Highest load L such that every day with load ≤ L was followed by green pain. */
  safeUpTo: number | null;
}

/**
 * Pairs each day's load with the following day's pain. Only pairs where the next
 * day has a real pain observation are used, so zero-filled days don't masquerade
 * as pain-free evidence.
 */
export function loadVsNextDayPain(series: DailyPoint[], settings: Settings, stream: LoadStream): ToleranceSummary {
  const points: TolerancePoint[] = [];
  for (let i = 0; i < series.length - 1; i++) {
    const next = series[i + 1];
    if (!next.painLogged) continue;
    points.push({ date: series[i].date, load: streamValue(series[i], stream), nextDayPain: next.pain });
  }
  const green = points.filter((p) => painZone(p.nextDayPain, settings) === 'green');
  const greenRange = green.length
    ? { min: Math.min(...green.map((p) => p.load)), max: Math.max(...green.map((p) => p.load)) }
    : null;
  const sorted = [...points].sort((a, b) => a.load - b.load);
  let safeUpTo: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (painZone(sorted[i].nextDayPain, settings) !== 'green') break;
    // Ties: a non-green point at the same load invalidates this load level.
    const sameLoadBad = sorted.some(
      (p) => p.load === sorted[i].load && painZone(p.nextDayPain, settings) !== 'green',
    );
    if (sameLoadBad) break;
    safeUpTo = sorted[i].load;
  }
  return { points, greenRange, safeUpTo };
}
