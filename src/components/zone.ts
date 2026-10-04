import { painZone, type Settings, type Status, type Zone } from '../domain'

export const ZONE_LABEL: Record<Zone, string> = { green: 'Green', amber: 'Amber', red: 'Red' }

export const ZONE_HEX: Record<Zone, string> = { green: '#0ca30c', amber: '#fab219', red: '#d03b3b' }

/** Filled (selected) styles per zone. */
export const ZONE_FILL: Record<Zone, string> = {
  green: 'bg-zone-green text-white',
  amber: 'bg-zone-amber text-stone-950',
  red: 'bg-zone-red text-white',
}

/** Subtle (unselected) styles per zone. */
export const ZONE_SOFT: Record<Zone, string> = {
  green: 'bg-green-50 text-green-900 ring-green-300 dark:bg-green-950/50 dark:text-green-200 dark:ring-green-800',
  amber: 'bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800',
  red: 'bg-red-50 text-red-900 ring-red-300 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800',
}

export const STATUS_ZONE: Record<Status, Zone> = { GREEN: 'green', AMBER: 'amber', RED: 'red' }

export function zoneOf(pain: number, s: Settings): Zone {
  return painZone(pain, s)
}

/** Categorical palette (fixed order, validated for CVD separation). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
