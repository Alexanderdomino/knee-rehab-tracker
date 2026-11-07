import type { ActivityType, Settings, Zone } from './types';

/**
 * Default knee-load factors per cardio activity, relative to cycling (1.0).
 * Starting points only — adjust them in Settings (and check with your physio).
 */
export const DEFAULT_KNEE_FACTORS: Record<string, number> = {
  walking: 0.5,
  cycling: 1,
  other: 1,
  rowing: 1.2,
  running: 1.5,
  sport: 1.5,
  kitesurfing: 2,
};

export const KITESURFING: ActivityType = { id: 'kitesurfing', name: 'Kitesurfing', kind: 'cardio', kneeFactor: 2 };
/** Rowing machine: low impact, but deep knee bend at the catch on every stroke. */
export const ROWING: ActivityType = { id: 'rowing', name: 'Rowing machine', kind: 'cardio', kneeFactor: 1.2 };

export const DEFAULT_ACTIVITY_TYPES: ActivityType[] = [
  { id: 'rehab', name: 'Knee rehab / strength', kind: 'strength' },
  { id: 'cycling', name: 'Cycling', kind: 'cardio', kneeFactor: 1 },
  ROWING,
  { id: 'running', name: 'Running', kind: 'cardio', kneeFactor: 1.5 },
  { id: 'walking', name: 'Walking', kind: 'cardio', kneeFactor: 0.5 },
  KITESURFING,
  { id: 'sport', name: 'Sport', kind: 'cardio', kneeFactor: 1.5 },
  { id: 'other', name: 'Other', kind: 'cardio', kneeFactor: 1 },
];

/**
 * Current version of the default activity-type list.
 * 2 = knee factors + Kitesurfing, 3 = Rowing machine.
 */
export const TYPES_VERSION = 3;

const matches = (re: RegExp) => (t: Pick<ActivityType, 'id' | 'name'>) => re.test(t.id) || re.test(t.name);
const isKite = matches(/kite/i);
// "Rowing", "Rowing machine", "Rower", "Ergometer", "Erg", "Concept2"
const isRowing = matches(/\b(row|erg)|concept\s*2/i);

/** Default knee factor for an activity: by id, then by name (e.g. a user-made "Kite surfing"), else 1. */
export function defaultKneeFactor(t: Pick<ActivityType, 'id' | 'name'>): number {
  if (t.id in DEFAULT_KNEE_FACTORS) return DEFAULT_KNEE_FACTORS[t.id];
  if (isKite(t)) return DEFAULT_KNEE_FACTORS.kitesurfing;
  if (isRowing(t)) return DEFAULT_KNEE_FACTORS.rowing;
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
 * Activities added to the defaults in later versions. Each is added to an older
 * saved list once (unless a matching activity already exists), next to `after`
 * if present, otherwise before Sport/Other, otherwise at the end.
 */
const ADDED_DEFAULTS: { version: number; type: ActivityType; exists: (t: ActivityType) => boolean; after: string }[] = [
  { version: 2, type: KITESURFING, exists: isKite, after: 'walking' },
  { version: 3, type: ROWING, exists: isRowing, after: 'cycling' },
];

/**
 * Bring an older stored activity list up to TYPES_VERSION: fill in missing knee
 * factors and add the activities introduced since `fromVersion`.
 */
export function migrateActivityTypes(types: ActivityType[], fromVersion: number): ActivityType[] {
  if (fromVersion >= TYPES_VERSION) return types;
  const out = types.map((t) =>
    t.kind === 'cardio' && !(Number(t.kneeFactor) > 0) ? { ...t, kneeFactor: defaultKneeFactor(t) } : t,
  );
  for (const added of ADDED_DEFAULTS) {
    if (fromVersion >= added.version || out.some(added.exists)) continue;
    const after = out.findIndex((t) => t.id === added.after);
    const before = out.findIndex((t) => t.id === 'sport' || t.id === 'other');
    const at = after >= 0 ? after + 1 : before >= 0 ? before : out.length;
    out.splice(at, 0, { ...added.type });
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
  bodyweightKg: null,
  bodyweightExercises: [],
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
  if (!Array.isArray(merged.bodyweightExercises)) merged.bodyweightExercises = [];
  const bw = Number(merged.bodyweightKg);
  merged.bodyweightKg = merged.bodyweightKg != null && Number.isFinite(bw) && bw > 0 ? bw : null;
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
  if (s.bodyweightKg !== null && !(Number(s.bodyweightKg) >= 20 && Number(s.bodyweightKg) <= 300))
    errors.push('Body weight must be 20–300 kg (or empty).');
  for (const t of s.activityTypes) {
    if (t.kind === 'cardio' && !(Number(t.kneeFactor) >= 0.1 && Number(t.kneeFactor) <= 5))
      errors.push(`Knee-load factor for ${t.name || 'an activity'} must be 0.1–5.`);
  }
  return errors;
}
