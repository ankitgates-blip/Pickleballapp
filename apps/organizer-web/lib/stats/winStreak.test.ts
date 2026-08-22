import { describe, it, expect } from 'vitest';
import { longestWinStreak } from './winStreak';
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

describe('longestWinStreak', () => {
  it('returns 0 for an empty match history', () => {
    expect(longestWinStreak([])).toBe(0);
  });

  it('returns 0 when every match was lost', () => {
    expect(longestWinStreak([match(false), match(false)])).toBe(0);
  });

  it('returns the full length when every match was won', () => {
    expect(longestWinStreak([match(true), match(true), match(true)])).toBe(3);
  });

  it('returns the longest run of consecutive wins, not just the most recent run', () => {
    // Two wins, a loss, then four wins -- the longest run (4) beats the earlier
    // run (2), even though the earlier run happened first.
    expect(
      longestWinStreak([
        match(true),
        match(true),
        match(false),
        match(true),
        match(true),
        match(true),
        match(true),
      ])
    ).toBe(4);
  });

  it('a loss after the best streak does not shrink the recorded best', () => {
    // Best run (3) happened, then a loss, then a shorter run (1) -- the record stays 3.
    expect(
      longestWinStreak([match(true), match(true), match(true), match(false), match(true)])
    ).toBe(3);
  });

  it('gives the same result regardless of most-recent-first or chronological order', () => {
    const chronological = [match(true), match(true), match(false), match(true), match(true), match(true)];
    const mostRecentFirst = [...chronological].reverse();
    expect(longestWinStreak(chronological)).toBe(longestWinStreak(mostRecentFirst));
    expect(longestWinStreak(chronological)).toBe(3);
  });
});
