import { defaultKneeFactor, kneeFactorOf } from './settings';
import type { ActivityType, Entry, Exercise, ExerciseSet, LoadContext, LoadStream } from './types';

/** A hold of this many seconds counts the same as one rep. */
export const SECONDS_PER_REP = 3;

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/** Rep-equivalents of a set: reps, or hold seconds ÷ 3 for isometric holds. */
export function repsEquivalent(x: Pick<ExerciseSet, 'reps' | 'holdSec'>): number {
  return x.holdSec != null && x.holdSec > 0 ? n(x.holdSec) / SECONDS_PER_REP : n(x.reps);
}

/**
 * The sets of an exercise. Entries logged before per-set tracking only have
 * sets × reps × kg, which means that many identical sets.
 */
export function exerciseSets(x: Exercise): ExerciseSet[] {
  if (Array.isArray(x.setDetails) && x.setDetails.length > 0) return x.setDetails;
  const count = Math.floor(n(x.sets));
  return Array.from({ length: count }, () => ({ reps: x.reps, loadKg: x.loadKg, holdSec: x.holdSec ?? null }));
}

/**
 * Normalise an exercise name for matching: lower case, notes in brackets such as
 * "(BW)" and punctuation dropped, spaces collapsed, and a plural "s" on the last
 * word removed. "Bulgarian Split Squats (BW)" → "bulgarian split squat".
 */
export function normalizeExerciseName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const last = words.length - 1;
  if (last >= 0 && words[last].length > 3 && words[last].endsWith('s') && !words[last].endsWith('ss')) {
    words[last] = words[last].slice(0, -1);
  }
  return words.join(' ');
}

export function isBodyweightExercise(name: string, bodyweightExercises: string[] | undefined): boolean {
  if (!bodyweightExercises?.length) return false;
  const key = normalizeExerciseName(name);
  return key !== '' && bodyweightExercises.some((b) => normalizeExerciseName(b) === key);
}

/** Body weight to add to each set of this exercise (0 unless it's a bodyweight exercise and body weight is set). */
export function bodyweightFor(x: Pick<Exercise, 'name'>, ctx?: LoadContext): number {
  const bw = Number(ctx?.bodyweightKg);
  return bw > 0 && isBodyweightExercise(x.name, ctx?.bodyweightExercises) ? bw : 0;
}

/**
 * Tonnage of one exercise in kg = Σ over its sets of reps (or hold s ÷ 3) ×
 * (added kg + body weight for bodyweight exercises).
 */
export function exerciseTonnage(x: Exercise, ctx?: LoadContext): number {
  const bw = bodyweightFor(x, ctx);
  return exerciseSets(x).reduce((sum, set) => sum + repsEquivalent(set) * (n(set.loadKg) + bw), 0);
}

/** Strength tonnage in kg = Σ exercise tonnage. */
export function tonnage(exercises: Exercise[] | undefined | null, ctx?: LoadContext): number {
  if (!exercises) return 0;
  return exercises.reduce((sum, x) => sum + exerciseTonnage(x, ctx), 0);
}

export function entryTonnage(entry: Pick<Entry, 'exercises'>, ctx?: LoadContext): number {
  return tonnage(entry.exercises, ctx);
}

/** Strength load of an entry: its tonnage (kg). Cardio entries contribute 0. */
export function strengthLoad(entry: Pick<Entry, 'kind' | 'exercises'>, ctx?: LoadContext): number {
  return entry.kind === 'strength' ? tonnage(entry.exercises, ctx) : 0;
}

/** Raw cardio minutes of an entry. Strength entries contribute 0. */
export function cardioMinutes(entry: Pick<Entry, 'kind' | 'durationMin'>): number {
  return entry.kind === 'cardio' ? n(entry.durationMin) : 0;
}

/**
 * Cardio load of an entry in knee-minutes = minutes × the activity's knee-load
 * factor (cycling = 1). Strength entries contribute 0.
 */
export function cardioLoad(entry: Pick<Entry, 'kind' | 'durationMin'>, kneeFactor = 1): number {
  return cardioMinutes(entry) * (kneeFactor > 0 ? kneeFactor : 1);
}

/**
 * Knee factor for an entry, looked up from the current activity types so that
 * changing a factor in Settings re-weights past sessions consistently. Entries
 * whose type was deleted fall back to the default for their id/name.
 */
export function entryKneeFactor(entry: Pick<Entry, 'activityTypeId' | 'activityName'>, types?: ActivityType[]): number {
  const t = types?.find((x) => x.id === entry.activityTypeId);
  return t ? kneeFactorOf(t) : defaultKneeFactor({ id: entry.activityTypeId, name: entry.activityName ?? '' });
}

export function entryLoad(
  entry: Pick<Entry, 'kind' | 'exercises' | 'durationMin' | 'activityTypeId' | 'activityName'>,
  stream: LoadStream,
  ctx?: LoadContext,
): number {
  return stream === 'strength' ? strengthLoad(entry, ctx) : cardioLoad(entry, entryKneeFactor(entry, ctx?.activityTypes));
}

export const STREAMS: { key: LoadStream; label: string; unit: string }[] = [
  { key: 'strength', label: 'Strength', unit: 'kg' },
  { key: 'cardio', label: 'Cardio', unit: 'knee-min' },
];

/** Cardio load is in knee-minutes: minutes × the activity's knee-load factor. */
export const STREAM_UNIT: Record<LoadStream, string> = { strength: 'kg', cardio: 'knee-min' };
export const STREAM_LABEL: Record<LoadStream, string> = { strength: 'Strength', cardio: 'Cardio' };

/** Human-readable load, e.g. "4,200 kg" or "420 knee-min". */
export function formatLoad(value: number, stream: LoadStream): string {
  return `${Math.round(value).toLocaleString('en-US')} ${STREAM_UNIT[stream]}`;
}
