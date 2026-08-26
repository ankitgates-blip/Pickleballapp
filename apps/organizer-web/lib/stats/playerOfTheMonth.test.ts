import { describe, it, expect } from 'vitest';
import { rankMonthlyCandidates } from './playerOfTheMonth';

describe('rankMonthlyCandidates', () => {
  it('excludes candidates below the 3-match eligibility floor', () => {
    const result = rankMonthlyCandidates([
      { personId: 'a', matchWins: 1, matchLosses: 0, leagueWins: 0 }, // 1 match -- excluded
      { personId: 'b', matchWins: 3, matchLosses: 2, leagueWins: 1 }, // 5 matches -- included
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe('b');
  });

  it('computes the weighted score exactly per the formula', () => {
    const result = rankMonthlyCandidates([
      { personId: 'a', matchWins: 8, matchLosses: 2, leagueWins: 2 }, // 10 played, 80%
      { personId: 'b', matchWins: 4, matchLosses: 1, leagueWins: 1 }, // 5 played, 80%
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
      { personId: 'low', matchWins: 3, matchLosses: 3, leagueWins: 0 },
      { personId: 'high', matchWins: 6, matchLosses: 0, leagueWins: 1 },
      { personId: 'mid', matchWins: 4, matchLosses: 2, leagueWins: 0 },
    ]);
    expect(result.map((r) => r.personId)).toEqual(['high', 'mid', 'low']);
  });

  it('returns an empty array when nobody is eligible', () => {
    const result = rankMonthlyCandidates([
      { personId: 'a', matchWins: 1, matchLosses: 0, leagueWins: 0 },
      { personId: 'b', matchWins: 0, matchLosses: 1, leagueWins: 0 },
    ]);
    expect(result).toEqual([]);
  });

  it('handles zero league wins across the whole eligible set without producing NaN', () => {
    const result = rankMonthlyCandidates([
      { personId: 'a', matchWins: 4, matchLosses: 1, leagueWins: 0 },
      { personId: 'b', matchWins: 2, matchLosses: 1, leagueWins: 0 },
    ]);
    expect(result.every((r) => Number.isFinite(r.score))).toBe(true);
  });
});
