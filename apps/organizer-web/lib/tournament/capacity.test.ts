import { describe, it, expect } from 'vitest';
import { slotsRemaining, isRosterFull } from './capacity';

describe('slotsRemaining', () => {
  it('returns null when there is no cap', () => {
    expect(slotsRemaining(null, 5)).toBeNull();
  });

  it('returns the number of open slots', () => {
    expect(slotsRemaining(12, 11)).toBe(1);
  });

  it('never returns negative when the roster is over capacity', () => {
    expect(slotsRemaining(10, 14)).toBe(0);
  });

  it('returns the full cap when nobody has been added yet', () => {
    expect(slotsRemaining(12, 0)).toBe(12);
  });
});

describe('isRosterFull', () => {
  it('is never full when there is no cap', () => {
    expect(isRosterFull(null, 999)).toBe(false);
  });

  it('is full when the count equals the cap', () => {
    expect(isRosterFull(12, 12)).toBe(true);
  });

  it('is full when the count exceeds the cap', () => {
    expect(isRosterFull(10, 14)).toBe(true);
  });

  it('is not full when the count is below the cap', () => {
    expect(isRosterFull(12, 11)).toBe(false);
  });
});
