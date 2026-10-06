import { addDays, dateRange } from './dates';
import { cardioLoad, cardioMinutes, entryKneeFactor, exerciseTonnage } from './load';
import type { ActivityType, DayLog, Entry, ISODate, LoadStream, Swelling } from './types';

/**
 * One calendar day after gap-filling. Days with neither a daily pain score nor
 * any entry are "zero-filled": pain 0 and volume 0, `logged: false`.
 */
export interface DailyPoint {
  date: ISODate;
  /** True if the day has a daily pain score or at least one entry. */
  logged: boolean;
  /** Daily pain score as stored, null if not logged that day. */
  dailyPain: number | null;
  /** Highest "during" session pain across entries that day. */
  maxSessionPain: number | null;
  /**
   * Pain used for zones/charts: daily score, else highest session pain, else 0.
   */
  pain: number;
  /** True if `pain` comes from a real observation (daily score or session pain). */
  painLogged: boolean;
  /** Highest next-morning pain recorded for entries on this day (i.e. felt the following morning). */
  nextMorningPain: number | null;
  /** Strength load: tonnage in kg (sets × reps × kg; holds count seconds ÷ 3 as reps). */
  strengthLoad: number;
  /** Cardio load in knee-minutes: Σ minutes × activity knee-load factor. */
  cardioLoad: number;
  /** Raw cardio minutes (unweighted). */
  cardioMinutes: number;
  distanceKm: number;
  entryCount: number;
  /** Cardio load (knee-minutes) per activity name. */
  cardioByType: Record<string, number>;
  /** Strength tonnage per exercise name. */
  tonnageByExercise: Record<string, number>;
  swelling: Swelling | null;
  entries: Entry[];
}

const SWELLING_RANK: Record<Swelling, number> = { none: 0, mild: 1, moderate: 2 };

export function maxSwelling(a: Swelling | null, b: Swelling | null): Swelling | null {
  if (a === null) return b;
  if (b === null) return a;
  return SWELLING_RANK[b] > SWELLING_RANK[a] ? b : a;
}

const maxOrNull = (a: number | null, b: number | null | undefined): number | null => {
  if (b === null || b === undefined || !Number.isFinite(b)) return a;
  return a === null ? b : Math.max(a, b);
};

/** Earliest date with a daily score or an entry, or null if there is no data. */
export function firstLogDate(days: DayLog[], entries: Entry[]): ISODate | null {
  let first: ISODate | null = null;
  for (const d of days) if (first === null || d.date < first) first = d.date;
  for (const e of entries) if (first === null || e.date < first) first = e.date;
  return first;
}

export function emptyPoint(date: ISODate): DailyPoint {
  return {
    date,
    logged: false,
    dailyPain: null,
    maxSessionPain: null,
    pain: 0,
    painLogged: false,
    nextMorningPain: null,
    strengthLoad: 0,
    cardioLoad: 0,
    cardioMinutes: 0,
    distanceKm: 0,
    entryCount: 0,
    cardioByType: {},
    tonnageByExercise: {},
    swelling: null,
    entries: [],
  };
}

/**
 * Build a continuous daily series from `start` (default: first log) to `end`
 * (inclusive). Missing days are filled at read time; nothing is written.
 * `activityTypes` supplies the knee-load factors for cardio (defaults if omitted).
 */
export function buildDailySeries(
  days: DayLog[],
  entries: Entry[],
  end: ISODate,
  start?: ISODate,
  activityTypes?: ActivityType[],
): DailyPoint[] {
  const from = start ?? firstLogDate(days, entries);
  if (!from || from > end) return [];

  const byDate = new Map<ISODate, DailyPoint>();
  const get = (date: ISODate) => {
    let p = byDate.get(date);
    if (!p) {
      p = emptyPoint(date);
      byDate.set(date, p);
    }
    return p;
  };

  for (const d of days) {
    if (d.date < from || d.date > end) continue;
    const p = get(d.date);
    p.dailyPain = d.pain;
    p.logged = true;
  }
  for (const e of entries) {
    if (e.date < from || e.date > end) continue;
    const p = get(e.date);
    p.logged = true;
    p.entryCount += 1;
    if (e.kind === 'strength') {
      for (const x of e.exercises ?? []) {
        const t = exerciseTonnage(x);
        p.strengthLoad += t;
        const name = x.name?.trim() || 'Exercise';
        p.tonnageByExercise[name] = (p.tonnageByExercise[name] ?? 0) + t;
      }
    } else {
      const load = cardioLoad(e, entryKneeFactor(e, activityTypes));
      p.cardioLoad += load;
      p.cardioMinutes += cardioMinutes(e);
      p.distanceKm += Number(e.distanceKm) || 0;
      const typeKey = e.activityName || e.activityTypeId;
      p.cardioByType[typeKey] = (p.cardioByType[typeKey] ?? 0) + load;
    }
    p.maxSessionPain = maxOrNull(p.maxSessionPain, e.painDuring);
    p.nextMorningPain = maxOrNull(p.nextMorningPain, e.painNextMorning);
    p.swelling = maxSwelling(p.swelling, e.swelling ?? null);
    p.entries.push(e);
  }

  return dateRange(from, end).map((date) => {
    const p = byDate.get(date) ?? emptyPoint(date);
    if (p.dailyPain !== null) {
      p.pain = p.dailyPain;
      p.painLogged = true;
    } else if (p.maxSessionPain !== null) {
      p.pain = p.maxSessionPain;
      p.painLogged = true;
    }
    p.entries.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return p;
  });
}

/** Look up the point for `date` in a series, or null if out of range. */
export function pointAt(series: DailyPoint[], date: ISODate): DailyPoint | null {
  if (series.length === 0) return null;
  const idx = Math.round(
    (Date.parse(date + 'T00:00:00Z') - Date.parse(series[0].date + 'T00:00:00Z')) / 86_400_000,
  );
  const p = series[idx];
  return p && p.date === date ? p : null;
}

/** Load of a day in the given stream (kg for strength, knee-minutes for cardio). */
export function streamValue(p: DailyPoint, stream: LoadStream): number {
  return stream === 'strength' ? p.strengthLoad : p.cardioLoad;
}

export function previousDate(date: ISODate): ISODate {
  return addDays(date, -1);
}
