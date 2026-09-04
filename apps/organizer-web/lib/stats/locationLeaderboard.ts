export type LocationLeaderboardEntry = {
  personId: string;
  matchWins: number;
  tournamentWins: number;
  score: number;
  winPercentage: number | null;
  matchesPlayed: number;
  losses: number;
};

type Candidate = {
  personId: string;
  matchWins: number;
  tournamentWins: number;
  matchesPlayed: number;
};

export function computeLocationLeaderboard(candidates: Candidate[]): LocationLeaderboardEntry[] {
  const maxTournamentWins = Math.max(0, ...candidates.map((c) => c.tournamentWins));
  const maxMatchWins = Math.max(0, ...candidates.map((c) => c.matchWins));

  return candidates
    .map((c) => {
      const tournamentScore = maxTournamentWins > 0 ? c.tournamentWins / maxTournamentWins : 0;
      const matchScore = maxMatchWins > 0 ? c.matchWins / maxMatchWins : 0;
      return {
        personId: c.personId,
        matchWins: c.matchWins,
        tournamentWins: c.tournamentWins,
        score: 0.6 * tournamentScore + 0.4 * matchScore,
        matchesPlayed: c.matchesPlayed,
        winPercentage:
          c.matchesPlayed > 0 ? Math.round((c.matchWins / c.matchesPlayed) * 100) : null,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.matchesPlayed - a.matchesPlayed;
    })
    .map(({ personId, matchWins, tournamentWins, score, winPercentage, matchesPlayed }) => ({
      personId,
      matchWins,
      tournamentWins,
      score,
      winPercentage,
      matchesPlayed,
      losses: matchesPlayed - matchWins,
    }));
}

export type LeaderboardCardRow = {
  matchWins: number;
  matchesPlayed: number;
  tournamentWins: number;
  totalPoints: number;
};

const CARD_POINTS_WEIGHT = 0.75;
const CARD_MATCHES_PLAYED_WEIGHT = 0.15;
const CARD_TOURNAMENT_WINS_WEIGHT = 0.1;

/**
 * Orders the merged win/loss + Total Points rows the /locations page actually renders.
 * Total Points is the card's sole hero stat (LocationLeaderboardCard shows it, boxed,
 * on every row) but computeLocationLeaderboard's composite score above never looks at
 * it -- that score predates the points system and still drives the row ORDER on its
 * own, which let someone with a big point total sit below someone with more
 * tournament/match wins but fewer points. That reads as a broken leaderboard once
 * points are the number everyone's looking at, so the display order has to follow it.
 *
 * A weighted composite, same normalize-to-the-field's-max approach as
 * computeLocationLeaderboard above: Total Points 75%, matches played 15%, tournament
 * wins 10%. Ties on the resulting score fall back to raw Total Points, then match
 * wins, then matches played.
 */
export function sortLeaderboardCardRows<T extends LeaderboardCardRow>(rows: readonly T[]): T[] {
  const maxPoints = Math.max(0, ...rows.map((r) => r.totalPoints));
  const maxMatchesPlayed = Math.max(0, ...rows.map((r) => r.matchesPlayed));
  const maxTournamentWins = Math.max(0, ...rows.map((r) => r.tournamentWins));

  return rows
    .map((row) => {
      const pointsScore = maxPoints > 0 ? row.totalPoints / maxPoints : 0;
      const matchesPlayedScore = maxMatchesPlayed > 0 ? row.matchesPlayed / maxMatchesPlayed : 0;
      const tournamentWinsScore = maxTournamentWins > 0 ? row.tournamentWins / maxTournamentWins : 0;
      const score =
        CARD_POINTS_WEIGHT * pointsScore +
        CARD_MATCHES_PLAYED_WEIGHT * matchesPlayedScore +
        CARD_TOURNAMENT_WINS_WEIGHT * tournamentWinsScore;
      return { row, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.row.totalPoints !== a.row.totalPoints) return b.row.totalPoints - a.row.totalPoints;
      if (b.row.matchWins !== a.row.matchWins) return b.row.matchWins - a.row.matchWins;
      return b.row.matchesPlayed - a.row.matchesPlayed;
    })
    .map((s) => s.row);
}
