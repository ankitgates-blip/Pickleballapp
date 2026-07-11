export type LocationLeaderboardEntry = {
  personId: string;
  matchWins: number;
  tournamentWins: number;
  score: number;
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
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.matchesPlayed - a.matchesPlayed;
    })
    .slice(0, 5)
    .map(({ personId, matchWins, tournamentWins, score }) => ({
      personId,
      matchWins,
      tournamentWins,
      score,
    }));
}
