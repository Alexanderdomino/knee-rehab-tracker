import { addDays } from './dates';
import { buildDailySeries } from './series';
import { DEFAULT_SETTINGS } from './settings';
import type { ActivityType, DayLog, Entry, ISODate, Settings } from './types';

let seq = 0;

export function entry(date: ISODate, overrides: Partial<Entry> = {}): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    date,
    activityTypeId: 'cycling',
    activityName: 'Cycling',
    kind: 'cardio',
    durationMin: 30,
    swelling: 'none',
    createdAt: seq,
    ...overrides,
  };
}

/** Cardio entry producing exactly `minutes` of cardio load. */
export function loadEntry(date: ISODate, minutes: number, overrides: Partial<Entry> = {}): Entry {
  return entry(date, { durationMin: minutes, ...overrides });
}

/** Strength entry producing exactly `kg` of tonnage (one exercise, 1 × 1 × kg). */
export function strengthEntry(date: ISODate, kg: number, overrides: Partial<Entry> = {}): Entry {
  return entry(date, {
    activityTypeId: 'rehab',
    activityName: 'Rehab',
    kind: 'strength',
    durationMin: null,
    exercises: [{ name: 'Leg press', sets: 1, reps: 1, loadKg: kg }],
    ...overrides,
  });
}

export function pains(start: ISODate, values: (number | null)[]): DayLog[] {
  const out: DayLog[] = [];
  values.forEach((v, i) => {
    if (v !== null) out.push({ date: addDays(start, i), pain: v });
  });
  return out;
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export function series(days: DayLog[], entries: Entry[], end: ISODate, start?: ISODate, types?: ActivityType[]) {
  return buildDailySeries(days, entries, end, start, types);
}
