import { addDays } from './dates';
import { buildDailySeries } from './series';
import { DEFAULT_SETTINGS } from './settings';
import type { DayLog, Entry, ISODate, Settings } from './types';

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
    rpe: 5,
    swelling: 'none',
    createdAt: seq,
    ...overrides,
  };
}

/** Entry producing exactly `load` units (duration = load, RPE 1). */
export function loadEntry(date: ISODate, load: number, overrides: Partial<Entry> = {}): Entry {
  return entry(date, { durationMin: load, rpe: 1, ...overrides });
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

export function series(days: DayLog[], entries: Entry[], end: ISODate, start?: ISODate) {
  return buildDailySeries(days, entries, end, start);
}
