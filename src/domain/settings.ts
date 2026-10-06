import type { ActivityType, Settings, Zone } from './types';

/**
 * Default knee-load factors per cardio activity, relative to cycling (1.0).
 * Starting points only — adjust them in Settings (and check with your physio).
 */
export const DEFAULT_KNEE_FACTORS: Record<string, number> = {
  walking: 0.5,
  cycling: 1,
  other: 1,
  running: 1.5,
  sport: 1.5,
  kitesurfing: 2,
};

export const KITESURFING: ActivityType = { id: 'kitesurfing', name: 'Kitesurfing', kind: 'cardio', kneeFactor: 2 };

export const DEFAULT_ACTIVITY_TYPES: ActivityType[] = [
  { id: 'rehab', name: 'Knee rehab / strength', kind: 'strength' },
  { id: 'cycling', name: 'Cycling', kind: 'cardio', kneeFactor: 1 },
  { id: 'running', name: 'Running', kind: 'cardio', kneeFactor: 1.5 },
  { id: 'walking', name: 'Walking', kind: 'cardio', kneeFactor: 0.5 },
  KITESURFING,
  { id: 'sport', name: 'Sport', kind: 'cardio', kneeFactor: 1.5 },
  { id: 'other', name: 'Other', kind: 'cardio', kneeFactor: 1 },
];

/** Current version of the default activity-type list (2 = knee factors + Kitesurfing). */
export const TYPES_VERSION = 2;

const isKite = (t: Pick<ActivityType, 'id' | 'name'>) => /kite/i.test(t.id) || /kite/i.test(t.name);

/** Default knee factor for an activity: by id, then by name (e.g. a user-made "Kite surfing"), else 1. */
export function defaultKneeFactor(t: Pick<ActivityType, 'id' | 'name'>): number {
  if (t.id in DEFAULT_KNEE_FACTORS) return DEFAULT_KNEE_FACTORS[t.id];
  if (isKite(t)) return DEFAULT_KNEE_FACTORS.kitesurfing;
  const byName = t.name.trim().toLowerCase();
  if (byName in DEFAULT_KNEE_FACTORS) return DEFAULT_KNEE_FACTORS[byName];
  return 1;
}

/** Knee factor to use for a cardio activity type (its own setting, else the default). */
export function kneeFactorOf(t: ActivityType): number {
  const f = Number(t.kneeFactor);
  return Number.isFinite(f) && f > 0 ? f : defaultKneeFactor(t);
}

/**
 * Bring an older stored activity list up to TYPES_VERSION: fill in missing knee
 * factors and add Kitesurfing unless a kite activity already exists.
 */
export function migrateActivityTypes(types: ActivityType[], fromVersion: number): ActivityType[] {
  if (fromVersion >= TYPES_VERSION) return types;
  const out = types.map((t) =>
    t.kind === 'cardio' && !(Number(t.kneeFactor) > 0) ? { ...t, kneeFactor: defaultKneeFactor(t) } : t,
  );
  if (!out.some(isKite)) {
    // Insert after Walking if present, otherwise before Sport/Other, otherwise at the end.
    const after = out.findIndex((t) => t.id === 'walking');
    const before = out.findIndex((t) => t.id === 'sport' || t.id === 'other');
    const at = after >= 0 ? after + 1 : before >= 0 ? before : out.length;
    out.splice(at, 0, { ...KITESURFING });
  }
  return out;
}

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
  activityTypes: DEFAULT_ACTIVITY_TYPES,
  typesVersion: TYPES_VERSION,
};

/** Merge a (possibly partial / older) stored settings doc over defaults. */
export function withDefaults(partial: Partial<Settings> | undefined | null): Settings {
  // Drop keys from older settings docs (e.g. defaultStrengthDurationMin) that are no longer used.
  const known = Object.fromEntries(
    Object.entries(partial ?? {}).filter(([k]) => k in DEFAULT_SETTINGS),
  ) as Partial<Settings>;
  const merged = { ...DEFAULT_SETTINGS, ...known };
  if (!Array.isArray(merged.activityTypes) || merged.activityTypes.length === 0) {
    merged.activityTypes = DEFAULT_ACTIVITY_TYPES;
  } else {
    merged.activityTypes = migrateActivityTypes(merged.activityTypes, Number(known.typesVersion) || 1);
  }
  merged.typesVersion = TYPES_VERSION;
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
  if (s.activityTypes.length === 0) errors.push('Keep at least one activity type.');
  for (const t of s.activityTypes) {
    if (t.kind === 'cardio' && !(Number(t.kneeFactor) >= 0.1 && Number(t.kneeFactor) <= 5))
      errors.push(`Knee-load factor for ${t.name || 'an activity'} must be 0.1–5.`);
  }
  return errors;
}
