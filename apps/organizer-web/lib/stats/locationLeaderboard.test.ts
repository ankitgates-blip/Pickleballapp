import { describe, it, expect } from 'vitest';
import { computeLocationLeaderboard } from './locationLeaderboard';

describe('computeLocationLeaderboard', () => {
  it('weights tournament wins at 60% and match wins at 40%, both normalized to the max', () => {
    const result = computeLocationLeaderboard([
      { personId: 'a', tournamentWins: 2, matchWins: 10, matchesPlayed: 15 },
      { personId: 'b', tournamentWins: 1, matchWins: 20, matchesPlayed: 25 },
    ]);

    // a: tournamentScore = 2/2 = 1, matchScore = 10/20 = 0.5 -> score = 0.6*1 + 0.4*0.5 = 0.8
    // b: tournamentScore = 1/2 = 0.5, matchScore = 20/20 = 1 -> score = 0.6*0.5 + 0.4*1 = 0.7
    expect(result.map((r) => r.personId)).toEqual(['a', 'b']);
    expect(result[0].score).toBeCloseTo(0.8);
    expect(result[1].score).toBeCloseTo(0.7);
  });

  it('returns only the top 5, dropping the lowest scores', () => {
    const candidates = Array.from({ length: 6 }, (_, i) => ({
      personId: `p${i}`,
      tournamentWins: 0,
      matchWins: 6 - i, // p0 has 6 wins (highest), p5 has 1 win (lowest)
      matchesPlayed: 10,
    }));

    const result = computeLocationLeaderboard(candidates);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.personId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('breaks ties by matchesPlayed descending', () => {
    const result = computeLocationLeaderboard([
      { personId: 'fewer-matches', tournamentWins: 0, matchWins: 5, matchesPlayed: 8 },
      { personId: 'more-matches', tournamentWins: 0, matchWins: 5, matchesPlayed: 10 },
    ]);

    // Both have identical score (same matchWins, same max, 0 tournament wins) -> tie-break by matchesPlayed
    expect(result.map((r) => r.personId)).toEqual(['more-matches', 'fewer-matches']);
  });

  it('scores everyone 0 for the tournament-win half when nobody has any tournament wins', () => {
    const result = computeLocationLeaderboard([
      { personId: 'a', tournamentWins: 0, matchWins: 10, matchesPlayed: 10 },
      { personId: 'b', tournamentWins: 0, matchWins: 5, matchesPlayed: 5 },
    ]);

    // No NaN from dividing by a zero max; ranking driven entirely by matchWins
    expect(result[0].personId).toBe('a');
    expect(result[0].score).toBeCloseTo(0.4); // 0.6*0 + 0.4*(10/10)
    expect(result[1].score).toBeCloseTo(0.2); // 0.6*0 + 0.4*(5/10)
  });

  it('includes a player with zero wins as long as they have played matches', () => {
    const result = computeLocationLeaderboard([
      { personId: 'winner', tournamentWins: 0, matchWins: 3, matchesPlayed: 3 },
      { personId: 'never-won', tournamentWins: 0, matchWins: 0, matchesPlayed: 4 },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.personId)).toEqual(['winner', 'never-won']);
    expect(result[1].score).toBe(0);
  });

  it('returns an empty array for no candidates', () => {
    expect(computeLocationLeaderboard([])).toEqual([]);
  });
});
