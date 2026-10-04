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
  reps: number;
  loadKg: number;
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
  /** Always present: strength entries default to the configured strength duration. */
  durationMin: number;
  distanceKm?: number | null;
  exercises?: Exercise[];
  rpe: number;
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
  /** Max rolling week-over-week load increase in % (default 10). */
  maxWeeklyIncreasePct: number;
  acwrUpper: number;
  acwrLower: number;
  reductionMinPct: number;
  reductionMaxPct: number;
  progressionPct: number;
  /** Number of logged green days required before progressing (default 7). */
  greenDaysRequired: number;
  /** Default duration used for strength sessions (default 45 min). */
  defaultStrengthDurationMin: number;
  activityTypes: ActivityType[];
}

export type Zone = 'green' | 'amber' | 'red';
export type Status = 'GREEN' | 'AMBER' | 'RED';
