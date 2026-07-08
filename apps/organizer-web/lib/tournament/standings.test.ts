import { describe, it, expect } from 'vitest';
import { computeStandings } from './standings';
import type { MatchResult } from '@/lib/types';

describe('computeStandings', () => {
  it('ignores pending matches', () => {
    const matches: MatchResult[] = [
      { teamAId: 'A', teamBId: 'B', scoreA: null, scoreB: null, status: 'pending' },
    ];
    expect(computeStandings(matches)).toEqual([]);
  });

  it('ignores byes', () => {
    const matches: MatchResult[] = [
      { teamAId: 'A', teamBId: null, scoreA: null, scoreB: null, status: 'complete' },
    ];
    expect(computeStandings(matches)).toEqual([]);
  });

  it('computes wins, losses, and point differential', () => {
    const matches: MatchResult[] = [
      { teamAId: 'A', teamBId: 'B', scoreA: 11, scoreB: 7, status: 'complete' },
      { teamAId: 'A', teamBId: 'C', scoreA: 6, scoreB: 11, status: 'complete' },
      { teamAId: 'B', teamBId: 'C', scoreA: 11, scoreB: 9, status: 'complete' },
    ];

    const standings = computeStandings(matches);
    const byId = new Map(standings.map((s) => [s.teamId, s]));

    expect(byId.get('A')).toEqual({
      teamId: 'A',
      wins: 1,
      losses: 1,
      pointsFor: 17,
      pointsAgainst: 18,
    });
    expect(byId.get('B')).toEqual({
      teamId: 'B',
      wins: 1,
      losses: 1,
      pointsFor: 18,
      pointsAgainst: 20,
    });
    expect(byId.get('C')).toEqual({
      teamId: 'C',
      wins: 1,
      losses: 1,
      pointsFor: 20,
      pointsAgainst: 17,
    });
  });

  it('sorts by wins, then point differential, descending', () => {
    const matches: MatchResult[] = [
      { teamAId: 'A', teamBId: 'B', scoreA: 11, scoreB: 1, status: 'complete' },
      { teamAId: 'A', teamBId: 'C', scoreA: 11, scoreB: 9, status: 'complete' },
      { teamAId: 'B', teamBId: 'C', scoreA: 11, scoreB: 5, status: 'complete' },
    ];

    const standings = computeStandings(matches);
    expect(standings.map((s) => s.teamId)).toEqual(['A', 'B', 'C']);
  });
});
