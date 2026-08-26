// apps/organizer-web/lib/stats/playerOfTheMonth.ts

export type MonthlyCandidate = {
  personId: string;
  matchWins: number;
  matchLosses: number;
  leagueWins: number;
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
