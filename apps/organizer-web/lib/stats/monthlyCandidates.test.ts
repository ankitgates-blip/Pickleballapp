import { describe, it, expect } from 'vitest';
import { buildMonthlyCandidates } from './monthlyCandidates';
import type { RawMatch, RawTeam } from './types';

describe('buildMonthlyCandidates', () => {
  it('tallies match wins/losses per person from completed matches', () => {
    const teams: RawTeam[] = [
      { id: 't1', tournamentId: 'tourn1', player1PersonId: 'alice', player2PersonId: 'bob' },
      { id: 't2', tournamentId: 'tourn1', player1PersonId: 'carol', player2PersonId: 'dave' },
    ];
    const matches: RawMatch[] = [
      {
        tournamentId: 'tourn1',
        tournamentDate: '2026-08-05',
        venueName: 'Pickleturf',
        teamAId: 't1',
        teamBId: 't2',
        scoreA: 11,
        scoreB: 5,
        status: 'complete',
      },
    ];

    const result = buildMonthlyCandidates(matches, teams, new Map());
    const alice = result.find((c) => c.personId === 'alice')!;
    const carol = result.find((c) => c.personId === 'carol')!;

    expect(alice.matchWins).toBe(1);
    expect(alice.matchLosses).toBe(0);
    expect(carol.matchWins).toBe(0);
    expect(carol.matchLosses).toBe(1);
  });

  it('attaches league wins from the supplied map, defaulting to 0', () => {
    const teams: RawTeam[] = [
      { id: 't1', tournamentId: 'tourn1', player1PersonId: 'alice', player2PersonId: 'bob' },
    ];
    const matches: RawMatch[] = [
      {
        tournamentId: 'tourn1',
        tournamentDate: '2026-08-05',
        venueName: 'Pickleturf',
        teamAId: 't1',
        teamBId: 't1',
        scoreA: 11,
        scoreB: 5,
        status: 'complete',
      },
    ];

    const result = buildMonthlyCandidates(matches, teams, new Map([['alice', 2]]));
    expect(result.find((c) => c.personId === 'alice')!.leagueWins).toBe(2);
    expect(result.find((c) => c.personId === 'bob')!.leagueWins).toBe(0);
  });

  it('returns one entry per unique team participant, with no duplicates', () => {
    const teams: RawTeam[] = [
      { id: 't1', tournamentId: 'tourn1', player1PersonId: 'alice', player2PersonId: 'bob' },
      { id: 't2', tournamentId: 'tourn2', player1PersonId: 'alice', player2PersonId: 'carol' },
    ];

    const result = buildMonthlyCandidates([], teams, new Map());
    const personIds = result.map((c) => c.personId).sort();
    expect(personIds).toEqual(['alice', 'bob', 'carol']);
  });

  it('returns an empty array when there are no teams', () => {
    expect(buildMonthlyCandidates([], [], new Map())).toEqual([]);
  });
});
