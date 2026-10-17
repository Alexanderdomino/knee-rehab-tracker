import {
  bodyweightFor,
  cardioLoad,
  entryKneeFactor,
  exerciseSets,
  strengthLoad,
  type Entry,
  type Exercise,
  type ExerciseSet,
  type LoadContext,
  type LoadStream,
} from '../domain'

const newer = (a: Entry, b: Entry) => a.date > b.date || (a.date === b.date && (a.createdAt ?? 0) > (b.createdAt ?? 0))

/** Most recent entry (by date, then creation time), optionally of a given activity type. */
export function latestEntry(entries: Entry[], activityTypeId?: string): Entry | null {
  let best: Entry | null = null
  for (const e of entries) {
    if (activityTypeId && e.activityTypeId !== activityTypeId) continue
    if (!best || newer(e, best)) best = e
  }
  return best
}

/** Short description, e.g. "30 min · 12 km" or "RDL 3×8 @ 60 kg, Iso leg extension 4×45 s @ 20 kg". */
export function entrySummary(e: Entry, ctx?: LoadContext): string {
  if (e.kind === 'cardio') {
    const parts = [`${e.durationMin ?? 0} min`]
    if (e.distanceKm) parts.push(`${e.distanceKm} km`)
    return parts.join(' · ')
  }
  const xs = e.exercises ?? []
  if (!xs.length) return 'No exercises'
  return xs.map((x) => describeExercise(x, ctx)).join(', ')
}

/**
 * e.g. "RDL 3×8 @ 60 kg", "Iso leg extension 4×45 s @ 20 kg", "Bulgarian split squat 3×10 @ BW + 10 kg",
 * or per set when they differ: "RDL 10 @ 60 kg, 8 @ 65 kg, 6 @ 70 kg".
 */
export function describeExercise(x: Exercise, ctx?: LoadContext): string {
  const sets = exerciseSets(x)
  const bw = bodyweightFor(x, ctx) > 0
  const perSet = (set: ExerciseSet) => (set.holdSec ? `${set.holdSec} s` : `${set.reps}`)
  const weight = (set: ExerciseSet) => (bw ? (set.loadKg ? `BW + ${set.loadKg} kg` : 'BW') : set.loadKg ? `${set.loadKg} kg` : '')
  const one = (set: ExerciseSet) => `${perSet(set)}${weight(set) ? ` @ ${weight(set)}` : ''}`
  const first = sets[0]
  if (!first) return x.name
  const uniform = sets.every((s) => s.reps === first.reps && s.loadKg === first.loadKg && (s.holdSec ?? null) === (first.holdSec ?? null))
  return uniform ? `${x.name} ${sets.length}×${one(first)}` : `${x.name} ${sets.map(one).join(', ')}`
}

/** The load an entry contributes: kg for strength, knee-minutes for cardio. */
export function entryLoad(e: Entry, ctx?: LoadContext): { value: number; stream: LoadStream } {
  return e.kind === 'strength'
    ? { value: strengthLoad(e, ctx), stream: 'strength' }
    : { value: cardioLoad(e, entryKneeFactor(e, ctx?.activityTypes)), stream: 'cardio' }
}
