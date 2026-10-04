import { cardioLoad, strengthLoad } from './load';
import type { DailyPoint } from './series';
import type { Entry, Exercise } from './types';

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';

export const DAILY_CSV_HEADER = [
  'date',
  'logged',
  'daily_pain',
  'pain_source',
  'strength_load_kg',
  'cardio_min',
  'distance_km',
  'entries',
  'activities',
  'max_session_pain',
  'next_morning_pain',
  'swelling',
  'notes',
];

/**
 * One row per calendar day of the (already gap-filled) series. Days not logged
 * get pain 0 / volume 0 and `logged = no`.
 */
export function dailyCsv(series: DailyPoint[]): string {
  const rows: unknown[][] = [DAILY_CSV_HEADER];
  for (const p of series) {
    rows.push([
      p.date,
      p.logged ? 'yes' : 'no',
      p.pain,
      p.dailyPain !== null ? 'daily' : p.painLogged ? 'session' : 'not_logged',
      Math.round(p.strengthLoad),
      p.cardioLoad,
      round2(p.distanceKm),
      p.entryCount,
      p.entries.map((e) => e.activityName).join('; '),
      p.maxSessionPain ?? '',
      p.nextMorningPain ?? '',
      p.swelling ?? '',
      p.entries.map((e) => e.notes?.trim()).filter(Boolean).join(' | '),
    ]);
  }
  return toCsv(rows);
}

export const ENTRIES_CSV_HEADER = [
  'date',
  'activity',
  'kind',
  'duration_min',
  'distance_km',
  'strength_load_kg',
  'cardio_min',
  'exercises',
  'pain_during',
  'pain_next_morning',
  'swelling',
  'notes',
];

/** Every activity entry with full detail (one row per entry). */
export function entriesCsv(entries: Entry[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const rows: unknown[][] = [ENTRIES_CSV_HEADER];
  for (const e of sorted) {
    rows.push([
      e.date,
      e.activityName,
      e.kind,
      e.durationMin ?? '',
      e.distanceKm ?? '',
      e.kind === 'strength' ? Math.round(strengthLoad(e)) : '',
      e.kind === 'cardio' ? cardioLoad(e) : '',
      (e.exercises ?? []).map(formatExercise).join('; '),
      e.painDuring ?? '',
      e.painNextMorning ?? '',
      e.swelling,
      e.notes ?? '',
    ]);
  }
  return toCsv(rows);
}

/** e.g. "Squat 3x10@40kg" or "Iso leg extension 4x45s@20kg". */
export function formatExercise(x: Exercise): string {
  const perSet = x.holdSec != null && x.holdSec > 0 ? `${x.holdSec}s` : `${x.reps}`;
  return `${x.name} ${x.sets}x${perSet}@${x.loadKg}kg`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
