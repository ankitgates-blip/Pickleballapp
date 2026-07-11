import { describe, it, expect } from 'vitest';
import { buildPersonMatchRecords } from './buildPersonMatchRecords';
import type { RawMatch, RawTeam } from './types';

describe('buildPersonMatchRecords', () => {
  const teams: RawTeam[] = [
    { id: 'team-ab', tournamentId: 't1', player1PersonId: 'alice', player2PersonId: 'bob' },
    { id: 'team-cd', tournamentId: 't1', player1PersonId: 'carol', player2PersonId: 'dave' },
  ];

  it('builds a record from the perspective of the requested person, on either side', () => {
    const matches: RawMatch[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        teamAId: 'team-ab',
        teamBId: 'team-cd',
        scoreA: 11,
        scoreB: 7,
        status: 'complete',
      },
    ];

    const aliceRecords = buildPersonMatchRecords('alice', matches, teams);
    expect(aliceRecords).toEqual([
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        partnerId: 'bob',
        opponentIds: ['carol', 'dave'],
        scoreFor: 11,
        scoreAgainst: 7,
        won: true,
      },
    ]);

    const carolRecords = buildPersonMatchRecords('carol', matches, teams);
    expect(carolRecords).toEqual([
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        partnerId: 'dave',
        opponentIds: ['alice', 'bob'],
        scoreFor: 7,
        scoreAgainst: 11,
        won: false,
      },
    ]);
  });

  it('excludes pending (incomplete) matches', () => {
    const matches: RawMatch[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        teamAId: 'team-ab',
        teamBId: 'team-cd',
        scoreA: 0,
        scoreB: 0,
        status: 'pending',
      },
    ];

    expect(buildPersonMatchRecords('alice', matches, teams)).toEqual([]);
  });

  it('excludes matches the requested person was not part of', () => {
    const matches: RawMatch[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06',
        venueName: 'Pickle Turf',
        teamAId: 'team-ab',
        teamBId: 'team-cd',
        scoreA: 11,
        scoreB: 7,
        status: 'complete',
      },
    ];

    expect(buildPersonMatchRecords('someone-else', matches, teams)).toEqual([]);
  });
});
