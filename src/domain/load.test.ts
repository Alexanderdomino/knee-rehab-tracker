import { describe, expect, it } from 'vitest';
import {
  bodyweightFor,
  cardioLoad,
  cardioMinutes,
  entryKneeFactor,
  exerciseSets,
  exerciseTonnage,
  formatLoad,
  isBodyweightExercise,
  normalizeExerciseName,
  repsEquivalent,
  strengthLoad,
  tonnage,
} from './load';

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

describe('per-set tracking', () => {
  it('sums each set separately when sets differ', () => {
    const rdl = {
      name: 'Romanian deadlift', sets: 3, reps: 10, loadKg: 60,
      setDetails: [{ reps: 10, loadKg: 60 }, { reps: 8, loadKg: 65 }, { reps: 6, loadKg: 70 }],
    };
    expect(exerciseTonnage(rdl)).toBe(600 + 520 + 420);
  });

  it('treats entries from before per-set tracking as identical sets', () => {
    const old = { name: 'Squat', sets: 3, reps: 10, loadKg: 40 };
    expect(exerciseSets(old)).toEqual([
      { reps: 10, loadKg: 40, holdSec: null },
      { reps: 10, loadKg: 40, holdSec: null },
      { reps: 10, loadKg: 40, holdSec: null },
    ]);
    expect(exerciseTonnage(old)).toBe(1200);
  });

  it('supports holds of different lengths per set', () => {
    const iso = { name: 'Iso', sets: 2, reps: 0, loadKg: 20, setDetails: [{ reps: 0, loadKg: 20, holdSec: 45 }, { reps: 0, loadKg: 20, holdSec: 30 }] };
    expect(exerciseTonnage(iso)).toBe(15 * 20 + 10 * 20);
  });
});

describe('bodyweight exercises', () => {
  it('normalises names: case, spacing, notes in brackets, punctuation and a plural s', () => {
    expect(normalizeExerciseName('  Bulgarian   Split Squats (BW) ')).toBe('bulgarian split squat');
    expect(normalizeExerciseName('bulgarian split-squat')).toBe('bulgarian split squat');
    expect(normalizeExerciseName('Leg press')).toBe('leg press'); // "ss" is not a plural
    expect(isBodyweightExercise('Bulgarian split squats', ['Bulgarian split squat'])).toBe(true);
    expect(isBodyweightExercise('BSS', ['Bulgarian split squat'])).toBe(false);
    expect(isBodyweightExercise('Squat', [])).toBe(false);
  });

  it('adds body weight to every set, including holds and sets with extra weight', () => {
    const ctx = { bodyweightKg: 80, bodyweightExercises: ['Bulgarian split squat'] };
    const bss = { name: 'Bulgarian split squats', sets: 2, reps: 10, loadKg: 0, setDetails: [{ reps: 10, loadKg: 0 }, { reps: 8, loadKg: 10 }] };
    expect(bodyweightFor(bss, ctx)).toBe(80);
    expect(exerciseTonnage(bss, ctx)).toBe(10 * 80 + 8 * 90);
    expect(exerciseTonnage(bss)).toBe(8 * 10); // no context: only added weight
    const wallSit = { name: 'Wall sit', sets: 1, reps: 0, loadKg: 0, holdSec: 30 };
    expect(exerciseTonnage(wallSit, { bodyweightKg: 80, bodyweightExercises: ['wall sits'] })).toBe(10 * 80);
  });

  it('adds nothing when body weight is not set or the exercise is not listed', () => {
    const bss = { name: 'Bulgarian split squat', sets: 3, reps: 10, loadKg: 0 };
    expect(exerciseTonnage(bss, { bodyweightKg: null, bodyweightExercises: ['Bulgarian split squat'] })).toBe(0);
    expect(exerciseTonnage(bss, { bodyweightKg: 80, bodyweightExercises: ['Step-up'] })).toBe(0);
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
