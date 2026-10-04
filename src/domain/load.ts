import type { Entry, Exercise, LoadStream } from './types';

/** A hold of this many seconds counts the same as one rep. */
export const SECONDS_PER_REP = 3;

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/** Rep-equivalents per set: reps, or hold seconds ÷ 3 for isometric holds. */
export function repsEquivalent(x: Pick<Exercise, 'reps' | 'holdSec'>): number {
  return x.holdSec != null && x.holdSec > 0 ? n(x.holdSec) / SECONDS_PER_REP : n(x.reps);
}

/** Tonnage of one exercise in kg = sets × reps (or hold s ÷ 3) × kg. */
export function exerciseTonnage(x: Exercise): number {
  return n(x.sets) * repsEquivalent(x) * n(x.loadKg);
}

/** Strength tonnage in kg = Σ exercise tonnage. */
export function tonnage(exercises: Exercise[] | undefined | null): number {
  if (!exercises) return 0;
  return exercises.reduce((sum, x) => sum + exerciseTonnage(x), 0);
}

export function entryTonnage(entry: Pick<Entry, 'exercises'>): number {
  return tonnage(entry.exercises);
}

/** Strength load of an entry: its tonnage (kg). Cardio entries contribute 0. */
export function strengthLoad(entry: Pick<Entry, 'kind' | 'exercises'>): number {
  return entry.kind === 'strength' ? tonnage(entry.exercises) : 0;
}

/** Cardio load of an entry: its duration in minutes. Strength entries contribute 0. */
export function cardioLoad(entry: Pick<Entry, 'kind' | 'durationMin'>): number {
  return entry.kind === 'cardio' ? n(entry.durationMin) : 0;
}

export function entryLoad(entry: Pick<Entry, 'kind' | 'exercises' | 'durationMin'>, stream: LoadStream): number {
  return stream === 'strength' ? strengthLoad(entry) : cardioLoad(entry);
}

export const STREAMS: { key: LoadStream; label: string; unit: string }[] = [
  { key: 'strength', label: 'Strength', unit: 'kg' },
  { key: 'cardio', label: 'Cardio', unit: 'min' },
];

export const STREAM_UNIT: Record<LoadStream, string> = { strength: 'kg', cardio: 'min' };
export const STREAM_LABEL: Record<LoadStream, string> = { strength: 'Strength', cardio: 'Cardio' };

/** Human-readable load, e.g. "4,200 kg" or "35 min". */
export function formatLoad(value: number, stream: LoadStream): string {
  return `${Math.round(value).toLocaleString('en-US')} ${STREAM_UNIT[stream]}`;
}
