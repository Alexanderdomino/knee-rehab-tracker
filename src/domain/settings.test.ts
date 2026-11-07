import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTIVITY_TYPES,
  DEFAULT_SETTINGS,
  defaultKneeFactor,
  kneeFactorOf,
  TYPES_VERSION,
  validateSettings,
  withDefaults,
} from './settings';
import type { ActivityType } from './types';

const OLD_TYPES: ActivityType[] = [
  { id: 'rehab', name: 'Knee rehab / strength', kind: 'strength' },
  { id: 'cycling', name: 'Cycling', kind: 'cardio' },
  { id: 'running', name: 'Running', kind: 'cardio' },
  { id: 'walking', name: 'Walking', kind: 'cardio' },
  { id: 'sport', name: 'Sport', kind: 'cardio' },
  { id: 'other', name: 'Other', kind: 'cardio' },
];

describe('default activity types', () => {
  it('include Kitesurfing, Rowing machine and a knee factor on every cardio type', () => {
    const kite = DEFAULT_ACTIVITY_TYPES.find((t) => t.id === 'kitesurfing');
    expect(kite).toMatchObject({ name: 'Kitesurfing', kind: 'cardio', kneeFactor: 2 });
    expect(DEFAULT_ACTIVITY_TYPES.find((t) => t.id === 'rowing')).toMatchObject({ name: 'Rowing machine', kind: 'cardio', kneeFactor: 1.2 });
    const factors = Object.fromEntries(DEFAULT_ACTIVITY_TYPES.filter((t) => t.kind === 'cardio').map((t) => [t.id, t.kneeFactor]));
    expect(factors).toEqual({ cycling: 1, rowing: 1.2, running: 1.5, walking: 0.5, kitesurfing: 2, sport: 1.5, other: 1 });
  });

  it('default factor by id, then by name, else 1', () => {
    expect(defaultKneeFactor({ id: 'walking', name: 'x' })).toBe(0.5);
    expect(defaultKneeFactor({ id: 'kite-surf-ab12c', name: 'Kite surfing' })).toBe(2);
    expect(defaultKneeFactor({ id: 'abc', name: 'Running' })).toBe(1.5);
    expect(defaultKneeFactor({ id: 'erg-x1', name: 'Ergometer' })).toBe(1.2);
    expect(defaultKneeFactor({ id: 'c2-ab', name: 'Concept2' })).toBe(1.2);
    expect(defaultKneeFactor({ id: 'yoga-1', name: 'Yoga' })).toBe(1);
    expect(defaultKneeFactor({ id: 'arrows-1', name: 'Archery arrows' })).toBe(1);
  });

  it('kneeFactorOf uses the stored factor, falling back to the default', () => {
    expect(kneeFactorOf({ id: 'walking', name: 'Walking', kind: 'cardio', kneeFactor: 0.8 })).toBe(0.8);
    expect(kneeFactorOf({ id: 'walking', name: 'Walking', kind: 'cardio' })).toBe(0.5);
    expect(kneeFactorOf({ id: 'walking', name: 'Walking', kind: 'cardio', kneeFactor: NaN })).toBe(0.5);
  });
});

describe('withDefaults migration of stored settings', () => {
  it('adds knee factors, Rowing (after Cycling) and Kitesurfing (after Walking) to an older saved list', () => {
    const s = withDefaults({ activityTypes: OLD_TYPES });
    expect(s.typesVersion).toBe(TYPES_VERSION);
    expect(s.activityTypes.map((t) => t.id)).toEqual(['rehab', 'cycling', 'rowing', 'running', 'walking', 'kitesurfing', 'sport', 'other']);
    expect(s.activityTypes.find((t) => t.id === 'walking')!.kneeFactor).toBe(0.5);
    expect(s.activityTypes.find((t) => t.id === 'rehab')!.kneeFactor).toBeUndefined();
  });

  it('keeps factors the user already set and does not duplicate a self-made kite activity', () => {
    const s = withDefaults({
      activityTypes: [
        { id: 'cycling', name: 'Cycling', kind: 'cardio', kneeFactor: 0.8 },
        { id: 'kitesurfing-x1y2z', name: 'Kite surfing', kind: 'cardio' },
      ],
    });
    expect(s.activityTypes).toEqual([
      { id: 'cycling', name: 'Cycling', kind: 'cardio', kneeFactor: 0.8 },
      { id: 'rowing', name: 'Rowing machine', kind: 'cardio', kneeFactor: 1.2 },
      { id: 'kitesurfing-x1y2z', name: 'Kite surfing', kind: 'cardio', kneeFactor: 2 },
    ]);
  });

  it('a list saved at version 2 only gets Rowing: a deleted Kitesurfing stays deleted', () => {
    const v2 = [
      { id: 'rehab', name: 'Knee rehab / strength', kind: 'strength' as const },
      { id: 'cycling', name: 'Cycling', kind: 'cardio' as const, kneeFactor: 1 },
      { id: 'walking', name: 'Walking', kind: 'cardio' as const, kneeFactor: 0.5 },
    ];
    const s = withDefaults({ activityTypes: v2, typesVersion: 2 });
    expect(s.activityTypes.map((t) => t.id)).toEqual(['rehab', 'cycling', 'rowing', 'walking']);
  });

  it('does not duplicate a self-made rowing activity', () => {
    const own = [{ id: 'concept2-q9', name: 'Concept2 row', kind: 'cardio' as const, kneeFactor: 1.4 }];
    const s = withDefaults({ activityTypes: own, typesVersion: 2 });
    expect(s.activityTypes).toEqual(own);
  });

  it('respects the user’s list once saved at the current version (e.g. Kitesurfing removed)', () => {
    const types = OLD_TYPES.map((t) => (t.kind === 'cardio' ? { ...t, kneeFactor: 1 } : t));
    const s = withDefaults({ activityTypes: types, typesVersion: TYPES_VERSION });
    expect(s.activityTypes).toEqual(types);
  });

  it('new users get the defaults', () => {
    expect(withDefaults(null).activityTypes).toEqual(DEFAULT_ACTIVITY_TYPES);
  });
});

describe('body weight settings', () => {
  it('default to unset with no exercises and sanitise stored values', () => {
    expect(withDefaults(null)).toMatchObject({ bodyweightKg: null, bodyweightExercises: [] });
    expect(withDefaults({ bodyweightKg: 80, bodyweightExercises: ['BSS'] })).toMatchObject({ bodyweightKg: 80, bodyweightExercises: ['BSS'] });
    expect(withDefaults({ bodyweightKg: 0 } as never).bodyweightKg).toBeNull();
  });

  it('validates body weight 20–300 kg or empty', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, bodyweightKg: null })).toEqual([]);
    expect(validateSettings({ ...DEFAULT_SETTINGS, bodyweightKg: 80 })).toEqual([]);
    expect(validateSettings({ ...DEFAULT_SETTINGS, bodyweightKg: 8 })).toEqual(['Body weight must be 20–300 kg (or empty).']);
    expect(validateSettings({ ...DEFAULT_SETTINGS, bodyweightKg: NaN })).toHaveLength(1);
  });
});

describe('validateSettings', () => {
  it('requires a knee factor of 0.1–5 on cardio types', () => {
    const withFactor = (kneeFactor: number) => ({
      ...DEFAULT_SETTINGS,
      activityTypes: [{ id: 'kitesurfing', name: 'Kitesurfing', kind: 'cardio' as const, kneeFactor }],
    });
    expect(validateSettings(withFactor(2))).toEqual([]);
    expect(validateSettings(withFactor(0.1))).toEqual([]);
    expect(validateSettings(withFactor(5))).toEqual([]);
    expect(validateSettings(withFactor(0))).toEqual(['Knee-load factor for Kitesurfing must be 0.1–5.']);
    expect(validateSettings(withFactor(6))).toHaveLength(1);
    expect(validateSettings(withFactor(NaN))).toHaveLength(1);
  });
});
