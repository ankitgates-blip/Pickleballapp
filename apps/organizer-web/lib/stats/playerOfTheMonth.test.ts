import { describe, it, expect } from 'vitest';
import { rankMonthlyCandidates, rankMonthlyCandidatesByPoints } from './playerOfTheMonth';

describe('rankMonthlyCandidates', () => {
  it('excludes candidates below the 3-match eligibility floor', () => {
    const result = rankMonthlyCandidates([
      { personId: 'a', matchWins: 1, matchLosses: 0, leagueWins: 0, totalPoints: 0 }, // 1 match -- excluded
      { personId: 'b', matchWins: 3, matchLosses: 2, leagueWins: 1, totalPoints: 0 }, // 5 matches -- included
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe('b');
  });

  it('computes the weighted score exactly per the formula', () => {
    const result = rankMonthlyCandidates([
      { personId: 'a', matchWins: 8, matchLosses: 2, leagueWins: 2, totalPoints: 0 }, // 10 played, 80%
      { personId: 'b', matchWins: 4, matchLosses: 1, leagueWins: 1, totalPoints: 0 }, // 5 played, 80%
    ]);
    // maxLeagueWins=2, maxMatchWins=8
    // a: normLeague=1, normMatch=1, winPct=80 -> 0.5*1 + 0.3*1 + 0.2*0.8 = 0.96
    // b: normLeague=0.5, normMatch=0.5, winPct=80 -> 0.5*0.5 + 0.3*0.5 + 0.2*0.8 = 0.56
    expect(result[0].personId).toBe('a');
    expect(result[0].score).toBeCloseTo(0.96, 5);
    expect(result[0].winPercentage).toBe(80);
    expect(result[0].matchesPlayed).toBe(10);
    expect(result[1].personId).toBe('b');
    expect(result[1].score).toBeCloseTo(0.56, 5);
  });

  it('sorts entries descending by score', () => {
    const result = rankMonthlyCandidates([
      { personId: 'low', matchWins: 3, matchLosses: 3, leagueWins: 0, totalPoints: 0 },
      { personId: 'high', matchWins: 6, matchLosses: 0, leagueWins: 1, totalPoints: 0 },
      { personId: 'mid', matchWins: 4, matchLosses: 2, leagueWins: 0, totalPoints: 0 },
    ]);
    expect(result.map((r) => r.personId)).toEqual(['high', 'mid', 'low']);
  });

  it('returns an empty array when nobody is eligible', () => {
    const result = rankMonthlyCandidates([
      { personId: 'a', matchWins: 1, matchLosses: 0, leagueWins: 0, totalPoints: 0 },
      { personId: 'b', matchWins: 0, matchLosses: 1, leagueWins: 0, totalPoints: 0 },
    ]);
    expect(result).toEqual([]);
  });

  it('handles zero league wins across the whole eligible set without producing NaN', () => {
    const result = rankMonthlyCandidates([
      { personId: 'a', matchWins: 4, matchLosses: 1, leagueWins: 0, totalPoints: 0 },
      { personId: 'b', matchWins: 2, matchLosses: 1, leagueWins: 0, totalPoints: 0 },
    ]);
    expect(result.every((r) => Number.isFinite(r.score))).toBe(true);
  });
});

describe('rankMonthlyCandidatesByPoints', () => {
  it('excludes candidates below the 60%-of-busiest-player appearance floor', () => {
    const result = rankMonthlyCandidatesByPoints([
      // busiest player played 10 -- 60% floor is 6
      { personId: 'busy', matchWins: 8, matchLosses: 2, leagueWins: 0, totalPoints: 100 },
      { personId: 'borderline', matchWins: 4, matchLosses: 2, leagueWins: 0, totalPoints: 90 }, // 6/10 = 60% -- included
      { personId: 'low-appearance', matchWins: 5, matchLosses: 0, leagueWins: 0, totalPoints: 200 }, // 5/10 = 50% -- excluded despite most points
    ]);
    expect(result.map((r) => r.personId).sort()).toEqual(['borderline', 'busy']);
  });

  it('computes the weighted score exactly per the 75/15/10 formula (Points/Appearance/League Wins)', () => {
    const result = rankMonthlyCandidatesByPoints([
      { personId: 'a', matchWins: 8, matchLosses: 2, leagueWins: 1, totalPoints: 200 }, // 10 played (max), 200 points (max), 1 league win (max)
      { personId: 'b', matchWins: 3, matchLosses: 3, leagueWins: 0, totalPoints: 100 }, // 6 played (60% floor, exactly eligible), 100 points, 0 league wins
    ]);
    // maxMatchesPlayed=10, maxTotalPoints=200, maxLeagueWins=1
    // a: normPoints=1, normAppearance=1, normLeague=1 -> 0.75*1 + 0.15*1 + 0.10*1 = 1.0
    // b: normPoints=0.5, normAppearance=0.6, normLeague=0 -> 0.75*0.5 + 0.15*0.6 + 0 = 0.375 + 0.09 = 0.465
    expect(result[0].personId).toBe('a');
    expect(result[0].score).toBeCloseTo(1.0, 5);
    expect(result[0].appearancePercentage).toBe(100);
    expect(result[1].personId).toBe('b');
    expect(result[1].score).toBeCloseTo(0.465, 5);
    expect(result[1].appearancePercentage).toBe(60);
  });

  it('ranks a lower-points, higher-appearance player above a higher-points, lower-appearance player when the math favors it', () => {
    const result = rankMonthlyCandidatesByPoints([
      // maxMatches=10, maxPoints=100, nobody has a league win this month
      { personId: 'grinder', matchWins: 10, matchLosses: 0, leagueWins: 0, totalPoints: 100 }, // 100% appearance, 100% points -> 0.90
      { personId: 'sniper', matchWins: 6, matchLosses: 0, leagueWins: 0, totalPoints: 100 }, // 60% appearance, 100% points -> 0.75 + 0.09 = 0.84
    ]);
    expect(result[0].personId).toBe('grinder');
    expect(result[0].score).toBeCloseTo(0.9, 5);
    expect(result[1].personId).toBe('sniper');
    expect(result[1].score).toBeCloseTo(0.84, 5);
  });

  it('lets a league (tournament) win close a points gap via the 10% weight', () => {
    const result = rankMonthlyCandidatesByPoints([
      // maxMatches=10, maxPoints=100, maxLeagueWins=1
      { personId: 'points-leader', matchWins: 10, matchLosses: 0, leagueWins: 0, totalPoints: 100 }, // 0.75 + 0.15 + 0 = 0.90
      { personId: 'champion', matchWins: 10, matchLosses: 0, leagueWins: 1, totalPoints: 88 }, // 0.75*0.88 + 0.15 + 0.10 = 0.66 + 0.15 + 0.10 = 0.91
    ]);
    expect(result[0].personId).toBe('champion');
    expect(result[0].score).toBeCloseTo(0.91, 5);
    expect(result[1].personId).toBe('points-leader');
    expect(result[1].score).toBeCloseTo(0.9, 5);
  });

  it('sorts entries descending by score, ties broken by matches played', () => {
    const result = rankMonthlyCandidatesByPoints([
      { personId: 'low', matchWins: 6, matchLosses: 0, leagueWins: 0, totalPoints: 50 },
      { personId: 'high', matchWins: 6, matchLosses: 0, leagueWins: 0, totalPoints: 100 },
      { personId: 'mid', matchWins: 6, matchLosses: 0, leagueWins: 0, totalPoints: 75 },
    ]);
    expect(result.map((r) => r.personId)).toEqual(['high', 'mid', 'low']);
  });

  it('returns an empty array when nobody has played a match', () => {
    const result = rankMonthlyCandidatesByPoints([
      { personId: 'a', matchWins: 0, matchLosses: 0, leagueWins: 0, totalPoints: 0 },
    ]);
    expect(result).toEqual([]);
  });

  it('handles zero points across the whole eligible set without producing NaN', () => {
    const result = rankMonthlyCandidatesByPoints([
      { personId: 'a', matchWins: 4, matchLosses: 1, leagueWins: 0, totalPoints: 0 },
      { personId: 'b', matchWins: 2, matchLosses: 1, leagueWins: 0, totalPoints: 0 },
    ]);
    expect(result.every((r) => Number.isFinite(r.score))).toBe(true);
  });

  it('has no absolute minimum match count beyond the 60% relative floor', () => {
    // Only one person played all month, with a single match -- they trivially meet
    // 60% of the busiest player's count (themselves), matching the spec's stated
    // eligibility rule exactly (no separate absolute floor was requested).
    const result = rankMonthlyCandidatesByPoints([
      { personId: 'solo', matchWins: 1, matchLosses: 0, leagueWins: 0, totalPoints: 10 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe('solo');
  });
});
