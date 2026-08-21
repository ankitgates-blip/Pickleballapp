import { describe, it, expect } from 'vitest';
import { winsInLastN } from './winsInLastN';
import type { PersonMatchRecord } from './types';

function match(won: boolean): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-01-01',
    venueName: 'Pickle Turf',
    partnerId: 'p1',
    opponentIds: ['o1', 'o2'],
    scoreFor: won ? 11 : 5,
    scoreAgainst: won ? 5 : 11,
    won,
  };
}

describe('winsInLastN', () => {
  it('counts wins among the most recent N matches', () => {
    const history = [match(true), match(true), match(false), match(true)];
    expect(winsInLastN(history, 3)).toBe(2);
  });

  it('uses the full history when there are fewer matches than N', () => {
    const history = [match(true), match(false)];
    expect(winsInLastN(history, 10)).toBe(1);
  });

  it('returns 0 for an empty match history', () => {
    expect(winsInLastN([], 10)).toBe(0);
  });
});
