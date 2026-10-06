import { cardioLoad, entryKneeFactor, strengthLoad, type ActivityType, type Entry, type Exercise, type LoadStream } from '../domain'

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
export function entrySummary(e: Entry): string {
  if (e.kind === 'cardio') {
    const parts = [`${e.durationMin ?? 0} min`]
    if (e.distanceKm) parts.push(`${e.distanceKm} km`)
    return parts.join(' · ')
  }
  const xs = e.exercises ?? []
  if (!xs.length) return 'No exercises'
  return xs.map(describeExercise).join(', ')
}

/** e.g. "RDL 3×8 @ 60 kg", "Iso leg extension 4×45 s @ 20 kg", "Step-up 3×12". */
export function describeExercise(x: Exercise): string {
  const perSet = x.holdSec ? `${x.holdSec} s` : `${x.reps}`
  return `${x.name} ${x.sets}×${perSet}${x.loadKg ? ` @ ${x.loadKg} kg` : ''}`
}

/** The load an entry contributes: kg for strength, knee-minutes for cardio. */
export function entryLoad(e: Entry, types?: ActivityType[]): { value: number; stream: LoadStream } {
  return e.kind === 'strength'
    ? { value: strengthLoad(e), stream: 'strength' }
    : { value: cardioLoad(e, entryKneeFactor(e, types)), stream: 'cardio' }
}
