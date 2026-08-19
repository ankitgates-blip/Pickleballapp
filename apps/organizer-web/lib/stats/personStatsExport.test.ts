import { describe, it, expect } from 'vitest';
import {
  buildPeriodRows,
  buildLocationRows,
  buildMatchHistoryRows,
  formatHeadToHead,
  starRatingLabel,
} from './personStatsExport';

describe('buildPeriodRows', () => {
  it('formats a period with a win percentage and an upward trend', () => {
    const result = buildPeriodRows([
      { period: '2026-08', gamesWon: 6, gamesLost: 2, tournamentsWon: 1, winPercentage: 75, trend: 'up', trendPointsChange: 5 },
    ]);
    expect(result).toEqual([
      { period: '2026-08', winPercentageLabel: '75%', trendLabel: 'Up +5pp', gamesWon: 6, gamesLost: 2 },
    ]);
  });

  it('formats a downward trend with the already-signed negative points change', () => {
    const result = buildPeriodRows([
      { period: '2026-07', gamesWon: 2, gamesLost: 6, tournamentsWon: 0, winPercentage: 25, trend: 'down', trendPointsChange: -10 },
    ]);
    expect(result[0].trendLabel).toBe('Down -10pp');
  });

  it('formats a flat trend as "Flat 0pp"', () => {
    const result = buildPeriodRows([
      { period: '2026-06', gamesWon: 4, gamesLost: 4, tournamentsWon: 0, winPercentage: 50, trend: 'flat', trendPointsChange: 0 },
    ]);
    expect(result[0].trendLabel).toBe('Flat 0pp');
  });

  it('formats a null trend (no previous period to compare) as an empty string', () => {
    const result = buildPeriodRows([
      { period: '2026-05', gamesWon: 3, gamesLost: 1, tournamentsWon: 0, winPercentage: 75, trend: null, trendPointsChange: null },
    ]);
    expect(result[0].trendLabel).toBe('');
  });

  it('formats a period with no games as "No matches"', () => {
    const result = buildPeriodRows([
      { period: '2026-04', gamesWon: 0, gamesLost: 0, tournamentsWon: 0, winPercentage: null, trend: null, trendPointsChange: null },
    ]);
    expect(result[0].winPercentageLabel).toBe('No matches');
  });
});

describe('buildLocationRows', () => {
  it('maps location counts to rows with a rounded win percentage', () => {
    const result = buildLocationRows([{ location: 'Pickle Turf', count: 4, wins: 3 }]);
    expect(result).toEqual([{ location: 'Pickle Turf', matchCount: 4, winPercentageLabel: '75%' }]);
  });

  it('formats a location with zero wins as "0%"', () => {
    const result = buildLocationRows([{ location: 'Picklers', count: 3, wins: 0 }]);
    expect(result[0].winPercentageLabel).toBe('0%');
  });
});

describe('buildMatchHistoryRows', () => {
  const nameById = new Map([
    ['p1', 'Alice'],
    ['p2', 'Bob'],
    ['p3', 'Carol'],
  ]);

  it('maps a won match to a W row with resolved names', () => {
    const result = buildMatchHistoryRows(
      [
        {
          tournamentId: 't1',
          tournamentDate: '2026-08-10',
          venueName: 'Pickle Turf',
          partnerId: 'p1',
          opponentIds: ['p2', 'p3'],
          scoreFor: 11,
          scoreAgainst: 7,
          won: true,
        },
      ],
      nameById
    );
    expect(result).toEqual([
      { date: '2026-08-10', partnerName: 'Alice', opponentsLabel: 'Bob / Carol', result: 'W', scoreLabel: '11-7' },
    ]);
  });

  it('maps a lost match to an L row', () => {
    const result = buildMatchHistoryRows(
      [
        {
          tournamentId: 't1',
          tournamentDate: '2026-08-10',
          venueName: 'Pickle Turf',
          partnerId: 'p1',
          opponentIds: ['p2', 'p3'],
          scoreFor: 7,
          scoreAgainst: 11,
          won: false,
        },
      ],
      nameById
    );
    expect(result[0].result).toBe('L');
  });

  it('falls back to "Unknown" for a missing name lookup', () => {
    const result = buildMatchHistoryRows(
      [
        {
          tournamentId: 't1',
          tournamentDate: '2026-08-10',
          venueName: 'Pickle Turf',
          partnerId: 'ghost',
          opponentIds: ['p2', 'ghost2'],
          scoreFor: 11,
          scoreAgainst: 7,
          won: true,
        },
      ],
      nameById
    );
    expect(result[0].partnerName).toBe('Unknown');
    expect(result[0].opponentsLabel).toBe('Bob / Unknown');
  });
});

describe('formatHeadToHead', () => {
  const nameById = new Map([['p1', 'Alice']]);

  it('formats a record with a resolved name and win-loss', () => {
    expect(formatHeadToHead({ personId: 'p1', wins: 5, losses: 2 }, nameById)).toBe('Alice (5-2)');
  });

  it('returns "Not enough matches yet" for a null record', () => {
    expect(formatHeadToHead(null, nameById)).toBe('Not enough matches yet');
  });

  it('falls back to "Unknown" for a missing name lookup', () => {
    expect(formatHeadToHead({ personId: 'ghost', wins: 1, losses: 0 }, nameById)).toBe('Unknown (1-0)');
  });
});

describe('starRatingLabel', () => {
  it('returns "No matches played yet" for a null win percentage', () => {
    expect(starRatingLabel(null)).toBe('No matches played yet');
  });

  it('formats an 80% win rate as 5/5 stars', () => {
    expect(starRatingLabel(80)).toBe('80% win rate (5/5 stars)');
  });

  it('formats a 55% win rate as 3/5 stars', () => {
    expect(starRatingLabel(55)).toBe('55% win rate (3/5 stars)');
  });

  it('formats a 10% win rate as 1/5 stars', () => {
    expect(starRatingLabel(10)).toBe('10% win rate (1/5 stars)');
  });
});
