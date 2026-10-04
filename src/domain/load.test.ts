import { describe, expect, it } from 'vitest';
import { sessionLoad, tonnage } from './load';

describe('session load', () => {
  it('is duration × RPE', () => {
    expect(sessionLoad({ durationMin: 45, rpe: 6 })).toBe(270);
    expect(sessionLoad({ durationMin: 0, rpe: 8 })).toBe(0);
  });
  it('treats invalid / negative inputs as 0', () => {
    expect(sessionLoad({ durationMin: NaN, rpe: 5 })).toBe(0);
    expect(sessionLoad({ durationMin: -10, rpe: 5 })).toBe(0);
  });
});

describe('tonnage', () => {
  it('sums sets × reps × kg', () => {
    expect(
      tonnage([
        { name: 'Leg press', sets: 3, reps: 10, loadKg: 60 },
        { name: 'Split squat', sets: 3, reps: 8, loadKg: 12.5 },
      ]),
    ).toBe(1800 + 300);
  });
  it('bodyweight exercises (0 kg) contribute 0 and missing list is 0', () => {
    expect(tonnage([{ name: 'Step-up', sets: 3, reps: 12, loadKg: 0 }])).toBe(0);
    expect(tonnage(undefined)).toBe(0);
  });
});
