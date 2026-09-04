import { describe, it, expect } from 'vitest';
import { computeLocationLeaderboard, sortLeaderboardCardRows } from './locationLeaderboard';

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

  it('ranks every candidate, not just a fixed top N -- the full roster, no cap', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      personId: `p${i}`,
      tournamentWins: 0,
      matchWins: 8 - i, // p0 has 8 wins (highest), p7 has 1 win (lowest)
      matchesPlayed: 10,
    }));

    const result = computeLocationLeaderboard(candidates);

    expect(result).toHaveLength(8);
    expect(result.map((r) => r.personId)).toEqual([
      'p0',
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
    ]);
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

  it('computes win percentage as matchWins over matchesPlayed, rounded', () => {
    const result = computeLocationLeaderboard([
      { personId: 'a', tournamentWins: 0, matchWins: 3, matchesPlayed: 4 }, // 75%
      { personId: 'b', tournamentWins: 0, matchWins: 1, matchesPlayed: 3 }, // 33.33% -> 33%
    ]);

    const byId = new Map(result.map((r) => [r.personId, r]));
    expect(byId.get('a')!.winPercentage).toBe(75);
    expect(byId.get('b')!.winPercentage).toBe(33);
  });

  it('returns null win percentage for a candidate with zero matches played', () => {
    const result = computeLocationLeaderboard([
      { personId: 'a', tournamentWins: 0, matchWins: 0, matchesPlayed: 0 },
    ]);

    expect(result[0].winPercentage).toBeNull();
  });

  it('includes matchesPlayed and derives losses from matchesPlayed minus matchWins', () => {
    const result = computeLocationLeaderboard([
      { personId: 'a', tournamentWins: 0, matchWins: 3, matchesPlayed: 5 },
    ]);

    expect(result[0].matchesPlayed).toBe(5);
    expect(result[0].matchWins).toBe(3);
    expect(result[0].losses).toBe(2);
  });
});

describe('sortLeaderboardCardRows', () => {
  it('weights Total Points at 75%, matches played at 15%, and tournament wins at 10%, all normalized to the max', () => {
    const result = sortLeaderboardCardRows([
      // a: pointsScore = 100/100 = 1, matchesScore = 8/10 = 0.8, tourneyScore = 1/2 = 0.5
      //    -> score = 0.75*1 + 0.15*0.8 + 0.10*0.5 = 0.75 + 0.12 + 0.05 = 0.92
      { personId: 'a', matchWins: 6, tournamentWins: 1, matchesPlayed: 8, totalPoints: 100 },
      // b: pointsScore = 50/100 = 0.5, matchesScore = 10/10 = 1, tourneyScore = 2/2 = 1
      //    -> score = 0.75*0.5 + 0.15*1 + 0.10*1 = 0.375 + 0.15 + 0.1 = 0.625
      { personId: 'b', matchWins: 7, tournamentWins: 2, matchesPlayed: 10, totalPoints: 50 },
    ]);
    expect(result.map((r) => r.personId)).toEqual(['a', 'b']);
  });

  it('ranks more Total Points above more matches played and tournament wins combined, reproducing the reported chirag/rajath case', () => {
    // rajath has more matches played and more tournament wins (the old, points-blind
    // composite would rank him first), but chirag's much larger Total Points total --
    // weighted at 75% -- outweighs that, so chirag must still come first.
    const result = sortLeaderboardCardRows([
      { personId: 'rajath', matchWins: 8, tournamentWins: 2, matchesPlayed: 11, totalPoints: 60 },
      { personId: 'chirag', matchWins: 5, tournamentWins: 0, matchesPlayed: 8, totalPoints: 110 },
    ]);
    expect(result.map((r) => r.personId)).toEqual(['chirag', 'rajath']);
  });

  it('falls back to raw Total Points, then match wins, then matches played when the weighted score ties', () => {
    const result = sortLeaderboardCardRows([
      { personId: 'fewer-points', matchWins: 2, tournamentWins: 0, matchesPlayed: 4, totalPoints: 50 },
      { personId: 'more-points', matchWins: 2, tournamentWins: 0, matchesPlayed: 4, totalPoints: 90 },
    ]);
    expect(result.map((r) => r.personId)).toEqual(['more-points', 'fewer-points']);
  });

  it('ranks by matches played (with no NaN) when nobody has any Total Points or tournament wins yet', () => {
    const result = sortLeaderboardCardRows([
      { personId: 'fewer-matches', matchWins: 1, tournamentWins: 0, matchesPlayed: 5, totalPoints: 0 },
      { personId: 'more-matches', matchWins: 1, tournamentWins: 0, matchesPlayed: 8, totalPoints: 0 },
    ]);
    expect(result.map((r) => r.personId)).toEqual(['more-matches', 'fewer-matches']);
  });

  it('does not mutate the input array', () => {
    const rows = [
      { personId: 'a', matchWins: 1, tournamentWins: 0, matchesPlayed: 1, totalPoints: 10 },
      { personId: 'b', matchWins: 1, tournamentWins: 0, matchesPlayed: 1, totalPoints: 20 },
    ];
    sortLeaderboardCardRows(rows);
    expect(rows.map((r) => r.personId)).toEqual(['a', 'b']);
  });
});
