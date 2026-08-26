// apps/organizer-web/lib/stats/monthlyCandidates.ts
import { buildPersonMatchRecords } from './buildPersonMatchRecords';
import type { RawMatch, RawTeam } from './types';
import type { MonthlyCandidate } from './playerOfTheMonth';

// Turns already-fetched, already-reshaped match/team data (for one venue, one month)
// into MonthlyCandidate[] for rankMonthlyCandidates -- by calling the existing, already
// -tested buildPersonMatchRecords once per participant rather than re-deriving "who won
// this match" logic. leagueWinsByPersonId is computed separately by the caller (via
// computeTournamentChampionPersonIds, once per tournament in scope) and merged in here.
export function buildMonthlyCandidates(
  matches: RawMatch[],
  teams: RawTeam[],
  leagueWinsByPersonId: Map<string, number>
): MonthlyCandidate[] {
  const personIds = new Set(teams.flatMap((t) => [t.player1PersonId, t.player2PersonId]));

  return Array.from(personIds).map((personId) => {
    const records = buildPersonMatchRecords(personId, matches, teams);
    return {
      personId,
      matchWins: records.filter((r) => r.won).length,
      matchLosses: records.filter((r) => !r.won).length,
      leagueWins: leagueWinsByPersonId.get(personId) ?? 0,
    };
  });
}
