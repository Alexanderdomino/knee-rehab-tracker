import { bodyweightFor, cardioLoad, entryKneeFactor, exerciseSets, strengthLoad } from './load';
import type { DailyPoint } from './series';
import type { Entry, Exercise, ExerciseSet, LoadContext } from './types';

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
  'cardio_load_knee_min',
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
      p.cardioMinutes,
      round2(p.cardioLoad),
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
  'knee_factor',
  'cardio_load_knee_min',
  'exercises',
  'pain_during',
  'pain_next_morning',
  'swelling',
  'notes',
];

/** Every activity entry with full detail (one row per entry). */
export function entriesCsv(entries: Entry[], ctx?: LoadContext): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const rows: unknown[][] = [ENTRIES_CSV_HEADER];
  for (const e of sorted) {
    rows.push([
      e.date,
      e.activityName,
      e.kind,
      e.durationMin ?? '',
      e.distanceKm ?? '',
      e.kind === 'strength' ? Math.round(strengthLoad(e, ctx)) : '',
      e.kind === 'cardio' ? entryKneeFactor(e, ctx?.activityTypes) : '',
      e.kind === 'cardio' ? round2(cardioLoad(e, entryKneeFactor(e, ctx?.activityTypes))) : '',
      (e.exercises ?? []).map((x) => formatExercise(x, ctx)).join('; '),
      e.painDuring ?? '',
      e.painNextMorning ?? '',
      e.swelling,
      e.notes ?? '',
    ]);
  }
  return toCsv(rows);
}

/**
 * Compact exercise text for CSV: "Squat 3x10@40kg" when all sets are the same,
 * otherwise each set: "RDL 10@60kg|8@65kg|6@70kg". Holds use seconds ("4x45s@20kg").
 * Bodyweight exercises get "+BW" after the added weight.
 */
export function formatExercise(x: Exercise, ctx?: LoadContext): string {
  const sets = exerciseSets(x);
  const bw = bodyweightFor(x, ctx) > 0 ? '+BW' : '';
  const one = (set: ExerciseSet) => `${set.holdSec != null && set.holdSec > 0 ? `${set.holdSec}s` : set.reps}@${set.loadKg}kg${bw}`;
  const first = sets[0];
  if (!first) return `${x.name} 0 sets`;
  const uniform = sets.every((s) => s.reps === first.reps && s.loadKg === first.loadKg && (s.holdSec ?? null) === (first.holdSec ?? null));
  return uniform ? `${x.name} ${sets.length}x${one(first)}` : `${x.name} ${sets.map(one).join('|')}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
