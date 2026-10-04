/** Calendar date in local time, formatted YYYY-MM-DD. */
export type ISODate = string;

export type ActivityKind = 'strength' | 'cardio';
export type Swelling = 'none' | 'mild' | 'moderate';

export interface ActivityType {
  id: string;
  name: string;
  kind: ActivityKind;
}

export interface Exercise {
  name: string;
  sets: number;
  /** Reps per set. Ignored for holds (when holdSec is set). */
  reps: number;
  loadKg: number;
  /** Isometric hold length per set in seconds; null/absent for normal reps. */
  holdSec?: number | null;
}

/** users/{uid}/days/{YYYY-MM-DD} */
export interface DayLog {
  date: ISODate;
  pain: number;
}

/** users/{uid}/entries/{id} */
export interface Entry {
  id: string;
  date: ISODate;
  activityTypeId: string;
  /** Snapshot of the activity name at logging time, so renamed/deleted types still display. */
  activityName: string;
  kind: ActivityKind;
  /** Cardio: session length (= cardio load). Strength: optional, not used for load. */
  durationMin?: number | null;
  distanceKm?: number | null;
  exercises?: Exercise[];
  /** Legacy: entries logged before RPE was removed may still carry it. Not used. */
  rpe?: number | null;
  painDuring?: number | null;
  painNextMorning?: number | null;
  swelling: Swelling;
  notes?: string;
  createdAt?: number;
}

export interface Settings {
  /** Highest pain value still in the green zone (default 2). */
  greenMax: number;
  /** Highest pain value still in the amber zone (default 5). Above is red. */
  amberMax: number;
  /** Pain strictly above this value triggers a RED alert (default 5). */
  painThreshold: number;
  /** Max rolling week-over-week load increase in % (default 10), per load stream. */
  maxWeeklyIncreasePct: number;
  acwrUpper: number;
  acwrLower: number;
  reductionMinPct: number;
  reductionMaxPct: number;
  progressionPct: number;
  /** Number of logged green days required before progressing (default 7). */
  greenDaysRequired: number;
  activityTypes: ActivityType[];
}

export type Zone = 'green' | 'amber' | 'red';
export type Status = 'GREEN' | 'AMBER' | 'RED';

/**
 * Load is tracked as two separate streams that can't be added together:
 * strength = tonnage in kg, cardio = minutes.
 */
export type LoadStream = 'strength' | 'cardio';
