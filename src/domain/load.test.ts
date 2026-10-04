import { describe, expect, it } from 'vitest';
import { cardioLoad, exerciseTonnage, formatLoad, repsEquivalent, strengthLoad, tonnage } from './load';

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

  it('formats with units', () => {
    expect(formatLoad(4200.4, 'strength')).toBe('4,200 kg');
    expect(formatLoad(35, 'cardio')).toBe('35 min');
  });
});
