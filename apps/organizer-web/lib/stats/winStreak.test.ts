import { describe, it, expect } from 'vitest';
import { currentWinStreak } from './winStreak';
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

describe('currentWinStreak', () => {
  it('returns 0 when the most recent match is a loss', () => {
    expect(currentWinStreak([match(false), match(true)])).toBe(0);
  });

  it('counts consecutive wins from the most recent match', () => {
    expect(currentWinStreak([match(true), match(true), match(false), match(true)])).toBe(2);
  });

  it('returns the full length when every match was won', () => {
    expect(currentWinStreak([match(true), match(true), match(true)])).toBe(3);
  });

  it('returns 0 for an empty match history', () => {
    expect(currentWinStreak([])).toBe(0);
  });
});
