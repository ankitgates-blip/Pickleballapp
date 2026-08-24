import { describe, it, expect } from 'vitest';
import { NUM_COURTS, courtForIndex, courtLabel, assignCourts } from './courts';

describe('courtForIndex', () => {
  it('maps indices 0-3 to courts 1-4', () => {
    expect(courtForIndex(0)).toBe(1);
    expect(courtForIndex(1)).toBe(2);
    expect(courtForIndex(2)).toBe(3);
    expect(courtForIndex(3)).toBe(4);
  });

  it('wraps back to court 1 at index 4', () => {
    expect(courtForIndex(4)).toBe(1);
  });

  it('wraps to court 4 at index 7 (second lap, last court)', () => {
    expect(courtForIndex(7)).toBe(4);
  });

  it('respects a custom numCourts', () => {
    expect(courtForIndex(2, 2)).toBe(1);
    expect(courtForIndex(3, 2)).toBe(2);
  });

  it('exposes NUM_COURTS as 4', () => {
    expect(NUM_COURTS).toBe(4);
  });
});

describe('courtLabel', () => {
  it('labels court 1 as Centre Court', () => {
    expect(courtLabel(1)).toBe('Centre Court');
  });

  it('labels courts 2-4 as "Court n"', () => {
    expect(courtLabel(2)).toBe('Court 2');
    expect(courtLabel(3)).toBe('Court 3');
    expect(courtLabel(4)).toBe('Court 4');
  });
});

describe('assignCourts', () => {
  it("preserves each row's original fields", () => {
    const rows = [
      { teamAId: 'a', teamBId: 'b' },
      { teamAId: 'c', teamBId: 'd' },
    ];
    const result = assignCourts(rows);
    expect(result[0]).toMatchObject({ teamAId: 'a', teamBId: 'b' });
    expect(result[1]).toMatchObject({ teamAId: 'c', teamBId: 'd' });
  });

  it('assigns court in array order matching courtForIndex, wrapping past 4', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: i }));
    const result = assignCourts(rows);
    expect(result.map((r) => r.court)).toEqual([1, 2, 3, 4, 1, 2]);
  });
});
