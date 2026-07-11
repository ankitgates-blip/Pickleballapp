import { describe, it, expect } from 'vitest';
import { computePersonStats } from './personStats';
import type { PersonMatchRecord, TournamentWon } from './types';

describe('computePersonStats', () => {
  it('rolls up games won/lost by week, month, and year', () => {
    const matches: PersonMatchRecord[] = [
      {
        tournamentId: 't1',
        tournamentDate: '2026-07-06', // a Monday
        venueName: 'Pickle Turf',
        partnerId: 'p-bob',
        opponentIds: ['p-carol', 'p-dave'],
        scoreFor: 11,
        scoreAgainst: 7,
        won: true,
      },
      {
        tournamentId: 't2',
        tournamentDate: '2026-07-13', // the following Monday
        venueName: 'Pickle Turf',
        partnerId: 'p-bob',
        opponentIds: ['p-carol', 'p-dave'],
        scoreFor: 6,
        scoreAgainst: 11,
        won: false,
      },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.weekly).toEqual([
      { period: '2026-07-13', gamesWon: 0, gamesLost: 1, tournamentsWon: 0, winPercentage: 0, trend: 'down', trendPointsChange: -100 },
      { period: '2026-07-06', gamesWon: 1, gamesLost: 0, tournamentsWon: 0, winPercentage: 100, trend: null, trendPointsChange: null },
    ]);
    expect(stats.monthly).toEqual([
      { period: '2026-07', gamesWon: 1, gamesLost: 1, tournamentsWon: 0, winPercentage: 50, trend: null, trendPointsChange: null },
    ]);
    expect(stats.yearly).toEqual([
      { period: '2026', gamesWon: 1, gamesLost: 1, tournamentsWon: 0, winPercentage: 50, trend: null, trendPointsChange: null },
    ]);
  });

  it('counts tournaments won in the correct period', () => {
    const tournamentsWon: TournamentWon[] = [{ tournamentId: 't1', date: '2026-07-06' }];
    const stats = computePersonStats([], tournamentsWon);

    expect(stats.monthly).toEqual([
      { period: '2026-07', gamesWon: 0, gamesLost: 0, tournamentsWon: 1, winPercentage: null, trend: null, trendPointsChange: null },
    ]);
  });

  it('identifies the toughest opponent by worst win rate, tie-broken by match count', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-eve', 'p-frank'], scoreFor: 4, scoreAgainst: 11, won: false },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-eve', 'p-frank'], scoreFor: 6, scoreAgainst: 11, won: false },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.toughestOpponent).toEqual({ personId: 'p-eve', wins: 0, losses: 2 });
  });

  it('identifies the best partner by highest win rate, tie-broken by match count', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
      { tournamentId: 't3', tournamentDate: '2026-07-20', venueName: 'Pickle Turf', partnerId: 'p-zara', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 3, won: true },
    ];

    const stats = computePersonStats(matches, []);

    // p-bob (2-0) and p-zara (1-0) are both undefeated; p-bob wins the tie-break with more matches.
    expect(stats.bestPartner).toEqual({ personId: 'p-bob', wins: 2, losses: 0 });
  });

  it('returns null toughestOpponent/bestPartner when there are no matches', () => {
    const stats = computePersonStats([], []);
    expect(stats.toughestOpponent).toBeNull();
    expect(stats.bestPartner).toBeNull();
  });

  it('sorts match history newest first', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-20', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
    ];

    const stats = computePersonStats(matches, []);
    expect(stats.matchHistory.map((m) => m.tournamentId)).toEqual(['t2', 't1']);
  });

  it('returns the most recent match date as lastPlayedDate, or null with no matches', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-20', venueName: 'Picklers', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 9, won: true },
    ];

    expect(computePersonStats(matches, []).lastPlayedDate).toBe('2026-07-20');
    expect(computePersonStats([], []).lastPlayedDate).toBeNull();
  });

  it('counts matches and wins by location, sorted by count descending', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 6, scoreAgainst: 11, won: false },
      { tournamentId: 't3', tournamentDate: '2026-07-20', venueName: 'Picklers', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 3, won: true },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.matchesByLocation).toEqual([
      { location: 'Pickle Turf', count: 2, wins: 1 },
      { location: 'Picklers', count: 1, wins: 1 },
    ]);
    expect(computePersonStats([], []).matchesByLocation).toEqual([]);
  });

  it('computes overall win percentage, rounded, or null with no matches', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-13', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 6, scoreAgainst: 11, won: false },
      { tournamentId: 't3', tournamentDate: '2026-07-20', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 3, won: true },
    ];

    // 2 wins out of 3 matches = 66.67%, rounds to 67
    expect(computePersonStats(matches, []).winPercentage).toBe(67);
    expect(computePersonStats([], []).winPercentage).toBeNull();
  });

  it('computes win percentage and trend per period, comparing to the next most recent period with data', () => {
    const matches: PersonMatchRecord[] = [
      // Week 1 (oldest): 2026-06-22, 1W 1L = 50%
      { tournamentId: 't1', tournamentDate: '2026-06-22', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't1', tournamentDate: '2026-06-22', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      // Week 2: 2026-06-29, 3W 1L = 75% (up from 50%)
      { tournamentId: 't2', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      // Week 3 (most recent): 2026-07-06, 1W 3L = 25% (down from 75%)
      { tournamentId: 't3', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't3', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      { tournamentId: 't3', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      { tournamentId: 't3', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.weekly).toEqual([
      { period: '2026-07-06', gamesWon: 1, gamesLost: 3, tournamentsWon: 0, winPercentage: 25, trend: 'down', trendPointsChange: -50 },
      { period: '2026-06-29', gamesWon: 3, gamesLost: 1, tournamentsWon: 0, winPercentage: 75, trend: 'up', trendPointsChange: 25 },
      { period: '2026-06-22', gamesWon: 1, gamesLost: 1, tournamentsWon: 0, winPercentage: 50, trend: null, trendPointsChange: null },
    ]);
  });

  it('marks trend as flat when win percentage is unchanged between periods', () => {
    const matches: PersonMatchRecord[] = [
      { tournamentId: 't1', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't1', tournamentDate: '2026-06-29', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
      { tournamentId: 't2', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 11, scoreAgainst: 7, won: true },
      { tournamentId: 't2', tournamentDate: '2026-07-06', venueName: 'Pickle Turf', partnerId: 'p-bob', opponentIds: ['p-carol', 'p-dave'], scoreFor: 5, scoreAgainst: 11, won: false },
    ];

    const stats = computePersonStats(matches, []);

    expect(stats.weekly[0].trend).toBe('flat');
    expect(stats.weekly[0].trendPointsChange).toBe(0);
  });
});
