// apps/organizer-web/lib/stats/monthlyCandidates.ts
import { buildPersonMatchRecords } from './buildPersonMatchRecords';
import type { RawMatch, RawTeam } from './types';
import type { MonthlyCandidate } from './playerOfTheMonth';

// Turns already-fetched, already-reshaped match/team data (for one venue, one month)
// into MonthlyCandidate[] for rankMonthlyCandidates/rankMonthlyCandidatesByPoints -- by
// calling the existing, already-tested buildPersonMatchRecords once per participant
// rather than re-deriving "who won this match" logic. leagueWinsByPersonId and
// totalPointsByPersonId are computed separately by the caller (via
// computeTournamentChampionPersonIds and computePointsLeaderboard respectively, once
// per tournament/month in scope) and merged in here. totalPointsByPersonId only
// matters for the September-onward points-weighted ranking -- pass an empty Map for
// any pre-September month still using the legacy formula.
export function buildMonthlyCandidates(
  matches: RawMatch[],
  teams: RawTeam[],
  leagueWinsByPersonId: Map<string, number>,
  totalPointsByPersonId: Map<string, number>
): MonthlyCandidate[] {
  const personIds = new Set(teams.flatMap((t) => [t.player1PersonId, t.player2PersonId]));

  return Array.from(personIds).map((personId) => {
    const records = buildPersonMatchRecords(personId, matches, teams);
    return {
      personId,
      matchWins: records.filter((r) => r.won).length,
      matchLosses: records.filter((r) => !r.won).length,
      leagueWins: leagueWinsByPersonId.get(personId) ?? 0,
      totalPoints: totalPointsByPersonId.get(personId) ?? 0,
    };
  });
}
