import { describe, expect, it } from 'vitest';
import { cardioLoad, cardioMinutes, entryKneeFactor, exerciseTonnage, formatLoad, repsEquivalent, strengthLoad, tonnage } from './load';

describe('tonnage (strength load)', () => {
  it('sums sets × reps × kg', () => {
    expect(
      tonnage([
        { name: 'Leg press', sets: 3, reps: 10, loadKg: 60 },
        { name: 'Split squat', sets: 3, reps: 8, loadKg: 12.5 },
      ]),
    ).toBe(1800 + 300);
  });

  it('heavier exercises count for more without any effort rating', () => {
    const easy = exerciseTonnage({ name: 'Leg extension', sets: 3, reps: 12, loadKg: 15 });
    const hard = exerciseTonnage({ name: 'Romanian deadlift', sets: 3, reps: 8, loadKg: 60 });
    expect(hard).toBeGreaterThan(easy * 2);
  });

  it('counts isometric holds as seconds ÷ 3 rep-equivalents and ignores reps', () => {
    const hold = { name: 'Iso leg extension', sets: 4, reps: 99, loadKg: 20, holdSec: 45 };
    expect(repsEquivalent(hold)).toBe(15);
    expect(exerciseTonnage(hold)).toBe(4 * 15 * 20);
  });

  it('bodyweight exercises (0 kg), invalid values and a missing list are 0', () => {
    expect(tonnage([{ name: 'Step-up', sets: 3, reps: 12, loadKg: 0 }])).toBe(0);
    expect(tonnage([{ name: 'x', sets: NaN, reps: 5, loadKg: 10 }])).toBe(0);
    expect(tonnage([{ name: 'x', sets: -3, reps: 5, loadKg: 10 }])).toBe(0);
    expect(tonnage(undefined)).toBe(0);
  });
});

describe('stream loads', () => {
  it('strength load is tonnage, only for strength entries', () => {
    const exercises = [{ name: 'Squat', sets: 3, reps: 10, loadKg: 40 }];
    expect(strengthLoad({ kind: 'strength', exercises })).toBe(1200);
    expect(strengthLoad({ kind: 'cardio', exercises })).toBe(0);
  });

  it('cardio load is minutes, only for cardio entries', () => {
    expect(cardioLoad({ kind: 'cardio', durationMin: 45 })).toBe(45);
    expect(cardioLoad({ kind: 'strength', durationMin: 45 })).toBe(0);
    expect(cardioLoad({ kind: 'cardio', durationMin: null })).toBe(0);
  });

  it('cardio load is minutes × knee factor', () => {
    expect(cardioMinutes({ kind: 'cardio', durationMin: 210 })).toBe(210);
    expect(cardioLoad({ kind: 'cardio', durationMin: 210 }, 2)).toBe(420);
    expect(cardioLoad({ kind: 'cardio', durationMin: 60 }, 0.5)).toBe(30);
    expect(cardioLoad({ kind: 'cardio', durationMin: 60 }, 0)).toBe(60); // invalid factor → 1
  });

  it('looks up the knee factor from current settings, with defaults for deleted types', () => {
    const types = [{ id: 'walking', name: 'Walking', kind: 'cardio' as const, kneeFactor: 0.7 }];
    expect(entryKneeFactor({ activityTypeId: 'walking', activityName: 'Walking' }, types)).toBe(0.7);
    expect(entryKneeFactor({ activityTypeId: 'kitesurfing', activityName: 'Kitesurfing' }, types)).toBe(2);
    expect(entryKneeFactor({ activityTypeId: 'gone-123', activityName: 'Old thing' }, types)).toBe(1);
    expect(entryKneeFactor({ activityTypeId: 'walking', activityName: 'Walking' })).toBe(0.5);
  });

  it('formats with units', () => {
    expect(formatLoad(4200.4, 'strength')).toBe('4,200 kg');
    expect(formatLoad(35, 'cardio')).toBe('35 knee-min');
  });
});
