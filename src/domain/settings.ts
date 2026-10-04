import type { ActivityType, Settings, Zone } from './types';

export const DEFAULT_ACTIVITY_TYPES: ActivityType[] = [
  { id: 'rehab', name: 'Knee rehab / strength', kind: 'strength' },
  { id: 'cycling', name: 'Cycling', kind: 'cardio' },
  { id: 'running', name: 'Running', kind: 'cardio' },
  { id: 'walking', name: 'Walking', kind: 'cardio' },
  { id: 'sport', name: 'Sport', kind: 'cardio' },
  { id: 'other', name: 'Other', kind: 'cardio' },
];

export const DEFAULT_SETTINGS: Settings = {
  greenMax: 2,
  amberMax: 5,
  painThreshold: 5,
  maxWeeklyIncreasePct: 10,
  acwrUpper: 1.3,
  acwrLower: 0.8,
  reductionMinPct: 20,
  reductionMaxPct: 30,
  progressionPct: 10,
  greenDaysRequired: 7,
  defaultStrengthDurationMin: 45,
  activityTypes: DEFAULT_ACTIVITY_TYPES,
};

/** Merge a (possibly partial / older) stored settings doc over defaults. */
export function withDefaults(partial: Partial<Settings> | undefined | null): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
  if (!Array.isArray(merged.activityTypes) || merged.activityTypes.length === 0) {
    merged.activityTypes = DEFAULT_ACTIVITY_TYPES;
  }
  return merged;
}

export function painZone(pain: number, s: Pick<Settings, 'greenMax' | 'amberMax'>): Zone {
  if (pain <= s.greenMax) return 'green';
  if (pain <= s.amberMax) return 'amber';
  return 'red';
}

/** Returns a list of human-readable problems; empty means valid. */
export function validateSettings(s: Settings): string[] {
  const errors: string[] = [];
  const intIn = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!intIn(s.greenMax, 0, 9)) errors.push('Green zone upper value must be 0–9.');
  if (!intIn(s.amberMax, 1, 10) || s.amberMax <= s.greenMax)
    errors.push('Amber zone upper value must be above the green value and at most 10.');
  if (!intIn(s.painThreshold, 0, 10)) errors.push('Pain threshold must be 0–10.');
  if (!intIn(s.maxWeeklyIncreasePct, 0, 100)) errors.push('Max weekly increase must be 0–100%.');
  if (!(s.acwrLower > 0 && s.acwrUpper > s.acwrLower && s.acwrUpper <= 5))
    errors.push('ACWR limits must satisfy 0 < lower < upper ≤ 5.');
  if (!intIn(s.reductionMinPct, 0, 100) || !intIn(s.reductionMaxPct, 0, 100) || s.reductionMinPct > s.reductionMaxPct)
    errors.push('Reduction range must be 0–100% with min ≤ max.');
  if (!intIn(s.progressionPct, 0, 100)) errors.push('Progression must be 0–100%.');
  if (!Number.isInteger(s.greenDaysRequired) || s.greenDaysRequired < 1 || s.greenDaysRequired > 60)
    errors.push('Green days required must be a whole number 1–60.');
  if (!intIn(s.defaultStrengthDurationMin, 1, 600)) errors.push('Default strength duration must be 1–600 min.');
  if (s.activityTypes.length === 0) errors.push('Keep at least one activity type.');
  return errors;
}
