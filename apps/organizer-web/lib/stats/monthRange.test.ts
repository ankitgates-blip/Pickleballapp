import { describe, it, expect } from 'vitest';
import { monthsToCheck, monthDateRange, monthToDateRange } from './monthRange';

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

describe('monthDateRange', () => {
  it('returns a full calendar month', () => {
    expect(monthDateRange(2026, 9)).toEqual({ start: '2026-09-01', endExclusive: '2026-10-01' });
  });

  it('crosses a year boundary for December', () => {
    expect(monthDateRange(2026, 12)).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' });
  });
});

describe('monthToDateRange', () => {
  it('includes today by making endExclusive tomorrow', () => {
    expect(monthToDateRange(new Date('2026-09-15T10:00:00Z'))).toEqual({
      start: '2026-09-01',
      endExclusive: '2026-09-16',
    });
  });

  it('rolls over into next month when today is the last day of the month', () => {
    expect(monthToDateRange(new Date('2026-09-30T23:00:00Z'))).toEqual({
      start: '2026-09-01',
      endExclusive: '2026-10-01',
    });
  });
});
