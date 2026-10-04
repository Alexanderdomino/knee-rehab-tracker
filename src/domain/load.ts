import type { Entry, Exercise } from './types';

/** Session load (arbitrary units) = duration in minutes × RPE. */
export function sessionLoad(entry: Pick<Entry, 'durationMin' | 'rpe'>): number {
  const d = Number(entry.durationMin) || 0;
  const r = Number(entry.rpe) || 0;
  return Math.max(0, d) * Math.max(0, r);
}

/** Strength tonnage in kg = Σ sets × reps × load. */
export function tonnage(exercises: Exercise[] | undefined | null): number {
  if (!exercises) return 0;
  return exercises.reduce(
    (sum, e) => sum + (Number(e.sets) || 0) * (Number(e.reps) || 0) * (Number(e.loadKg) || 0),
    0,
  );
}

export function entryTonnage(entry: Pick<Entry, 'exercises'>): number {
  return tonnage(entry.exercises);
}
