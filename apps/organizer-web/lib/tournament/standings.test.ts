import { describe, it, expect } from 'vitest';
import { computeStandings, computeIndividualStandings } from './standings';
import type { MatchResult, Team } from '@/lib/types';

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

describe('computeIndividualStandings', () => {
  const teams: Team[] = [
    { id: 'T1', tournamentId: 'tourney', player1Id: 'p1', player2Id: 'p2' },
    { id: 'T2', tournamentId: 'tourney', player1Id: 'p3', player2Id: 'p4' },
  ];

  it('credits both players on each side individually', () => {
    const matches: MatchResult[] = [
      { teamAId: 'T1', teamBId: 'T2', scoreA: 11, scoreB: 7, status: 'complete' },
    ];

    const standings = computeIndividualStandings(matches, teams);
    const byId = new Map(standings.map((s) => [s.playerId, s]));

    expect(byId.get('p1')).toEqual({ playerId: 'p1', wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 7 });
    expect(byId.get('p2')).toEqual({ playerId: 'p2', wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 7 });
    expect(byId.get('p3')).toEqual({ playerId: 'p3', wins: 0, losses: 1, pointsFor: 7, pointsAgainst: 11 });
    expect(byId.get('p4')).toEqual({ playerId: 'p4', wins: 0, losses: 1, pointsFor: 7, pointsAgainst: 11 });
  });

  it('aggregates a player across multiple different team IDs (rotating partners)', () => {
    const rotatingTeams: Team[] = [
      { id: 'T1', tournamentId: 'tourney', player1Id: 'p1', player2Id: 'p2' },
      { id: 'T2', tournamentId: 'tourney', player1Id: 'p3', player2Id: 'p4' },
      { id: 'T3', tournamentId: 'tourney', player1Id: 'p1', player2Id: 'p3' },
      { id: 'T4', tournamentId: 'tourney', player1Id: 'p2', player2Id: 'p4' },
    ];
    const matches: MatchResult[] = [
      { teamAId: 'T1', teamBId: 'T2', scoreA: 11, scoreB: 7, status: 'complete' },
      { teamAId: 'T3', teamBId: 'T4', scoreA: 6, scoreB: 11, status: 'complete' },
    ];

    const standings = computeIndividualStandings(matches, rotatingTeams);
    const p1 = standings.find((s) => s.playerId === 'p1')!;

    expect(p1.wins).toBe(1);
    expect(p1.losses).toBe(1);
    expect(p1.pointsFor).toBe(17);
    expect(p1.pointsAgainst).toBe(18);
  });

  it('ignores pending matches and byes, same as computeStandings', () => {
    const matches: MatchResult[] = [
      { teamAId: 'T1', teamBId: 'T2', scoreA: null, scoreB: null, status: 'pending' },
      { teamAId: 'T1', teamBId: null, scoreA: null, scoreB: null, status: 'complete' },
    ];
    expect(computeIndividualStandings(matches, teams)).toEqual([]);
  });

  it('sorts by wins, then point differential, descending', () => {
    const matches: MatchResult[] = [
      { teamAId: 'T1', teamBId: 'T2', scoreA: 11, scoreB: 1, status: 'complete' },
    ];
    const standings = computeIndividualStandings(matches, teams);
    expect(standings.map((s) => s.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
