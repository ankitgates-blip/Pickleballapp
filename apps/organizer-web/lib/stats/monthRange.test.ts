import { describe, it, expect } from 'vitest';
import { monthsToCheck } from './monthRange';

describe('monthsToCheck', () => {
  it('returns every month from start through the month before today, inclusive', () => {
    expect(monthsToCheck(2026, 6, 2026, 8)).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it('returns an empty array when start is the current month (nothing completed yet)', () => {
    expect(monthsToCheck(2026, 8, 2026, 8)).toEqual([]);
  });

  it('returns an empty array when start is after the current month', () => {
    expect(monthsToCheck(2026, 9, 2026, 8)).toEqual([]);
  });

  it('crosses a year boundary correctly', () => {
    expect(monthsToCheck(2025, 11, 2026, 2)).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
  });

  it('returns a single month when start is exactly last month', () => {
    expect(monthsToCheck(2026, 7, 2026, 8)).toEqual([{ year: 2026, month: 7 }]);
  });
});
