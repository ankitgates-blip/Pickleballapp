// apps/organizer-web/lib/stats/playerOfTheMonth.ts

export type MonthlyCandidate = {
  personId: string;
  matchWins: number;
  matchLosses: number;
  leagueWins: number;
  // Only used by rankMonthlyCandidatesByPoints (the September-onward formula) --
  // rankMonthlyCandidates (legacy, pre-September) ignores this field.
  totalPoints: number;
};

export type MonthlyRankedEntry = {
  personId: string;
  score: number;
  matchWins: number;
  leagueWins: number;
  winPercentage: number;
  matchesPlayed: number;
};

const MIN_MATCHES_PLAYED = 3;

export type MonthlyPointsRankedEntry = {
  personId: string;
  score: number;
  matchWins: number;
  leagueWins: number;
  totalPoints: number;
  winPercentage: number;
  matchesPlayed: number;
  // This person's matches played as a percentage of the month's most active player
  // (the same denominator the 60% eligibility floor uses) -- exposed so the UI can
  // show why someone is or isn't in the running, not just their raw match count.
  appearancePercentage: number;
};

const APPEARANCE_ELIGIBILITY_THRESHOLD = 0.6; // must have played >= 60% of the month's busiest player's matches
const POINTS_WEIGHT = 0.85;
const APPEARANCE_WEIGHT = 0.15;

/**
 * September-2026-onward Player of the Month ranking: 85% Total Points Earned + 15%
 * Matches Played/Appearance, both normalized against the month's most active
 * candidate (not an absolute scale) -- same normalize-by-max convention as
 * rankMonthlyCandidates and computeLocationLeaderboard elsewhere in this file/module.
 * Eligibility is *only* the 60% appearance floor (no separate absolute-match-count
 * floor): a player below 60% of the busiest player's match count is excluded
 * regardless of how many points they earned. Superseded rankMonthlyCandidates (which
 * stays in place, unchanged, for any not-yet-locked pre-September month) rather than
 * replacing it, since that function's formula has no real point totals to weight by
 * before the points system existed.
 */
export function rankMonthlyCandidatesByPoints(candidates: MonthlyCandidate[]): MonthlyPointsRankedEntry[] {
  const withMatches = candidates
    .map((c) => ({ ...c, matchesPlayed: c.matchWins + c.matchLosses }))
    .filter((c) => c.matchesPlayed > 0);
  const maxMatchesPlayed = Math.max(0, ...withMatches.map((c) => c.matchesPlayed));
  const eligible = withMatches.filter(
    (c) => maxMatchesPlayed > 0 && c.matchesPlayed >= APPEARANCE_ELIGIBILITY_THRESHOLD * maxMatchesPlayed
  );
  const maxTotalPoints = Math.max(0, ...eligible.map((c) => c.totalPoints));

  return eligible
    .map((c) => {
      const winPercentage = Math.round((c.matchWins / c.matchesPlayed) * 100);
      const appearancePercentage = Math.round((c.matchesPlayed / maxMatchesPlayed) * 100);
      const normalizedPoints = maxTotalPoints > 0 ? c.totalPoints / maxTotalPoints : 0;
      const normalizedAppearance = c.matchesPlayed / maxMatchesPlayed;
      const score = POINTS_WEIGHT * normalizedPoints + APPEARANCE_WEIGHT * normalizedAppearance;
      return {
        personId: c.personId,
        score,
        matchWins: c.matchWins,
        leagueWins: c.leagueWins,
        totalPoints: c.totalPoints,
        winPercentage,
        matchesPlayed: c.matchesPlayed,
        appearancePercentage,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.matchesPlayed - a.matchesPlayed;
    });
}

// Weighted composite score for one venue's monthly Player of the Month race, in the
// same spirit as computeLocationLeaderboard's normalized weighting -- league wins
// (championships) count for the most, then match-win volume, then win percentage
// (efficiency). Only candidates meeting the 3-match floor are scored at all; the
// normalization denominators (maxLeagueWins/maxMatchWins) are computed over that
// already-filtered eligible set, not the full input, so one prolific-but-ineligible
// player never distorts everyone else's normalized score.
export function rankMonthlyCandidates(candidates: MonthlyCandidate[]): MonthlyRankedEntry[] {
  const eligible = candidates.filter((c) => c.matchWins + c.matchLosses >= MIN_MATCHES_PLAYED);
  const maxLeagueWins = Math.max(0, ...eligible.map((c) => c.leagueWins));
  const maxMatchWins = Math.max(0, ...eligible.map((c) => c.matchWins));

  return eligible
    .map((c) => {
      const matchesPlayed = c.matchWins + c.matchLosses;
      const winPercentage = Math.round((c.matchWins / matchesPlayed) * 100);
      const normalizedLeagueWins = maxLeagueWins > 0 ? c.leagueWins / maxLeagueWins : 0;
      const normalizedMatchWins = maxMatchWins > 0 ? c.matchWins / maxMatchWins : 0;
      const score = 0.5 * normalizedLeagueWins + 0.3 * normalizedMatchWins + 0.2 * (winPercentage / 100);
      return {
        personId: c.personId,
        score,
        matchWins: c.matchWins,
        leagueWins: c.leagueWins,
        winPercentage,
        matchesPlayed,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.matchesPlayed - a.matchesPlayed;
    });
}
