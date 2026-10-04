import { tonnage, type Entry } from '../domain'

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

export function entrySummary(e: Entry): string {
  const parts = [`${e.durationMin} min`, `RPE ${e.rpe}`]
  if (e.distanceKm) parts.push(`${e.distanceKm} km`)
  if (e.kind === 'strength' && e.exercises?.length) {
    parts.push(`${e.exercises.length} exercise${e.exercises.length > 1 ? 's' : ''}`)
    const t = tonnage(e.exercises)
    if (t) parts.push(`${Math.round(t)} kg`)
  }
  return parts.join(' · ')
}
