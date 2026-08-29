// apps/organizer-web/lib/stats/points.ts
import { buildPersonMatchRecords } from './buildPersonMatchRecords';
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import type { ChampionMatch } from '@/lib/tournament/champion';
import type { DateRange } from './monthRange';
import type { RawMatch, RawTeam } from './types';

export const POINTS_PER_MATCH_WIN = 10;
export const POINTS_PER_LEAGUE_WIN = 25;

/**
 * The points system goes live for tournaments PLAYED on or after this date.
 * Keyed off tournaments.date (the scheduled play date), never completed_at --
 * a league scheduled in August might not get marked complete until September
 * (or vice versa), and individual matches carry no date of their own. A
 * hardcoded constant on purpose: a scoring rule is not configuration, and a
 * mutable cutover could silently invalidate a leaderboard someone already
 * shared as an image/PDF.
 */
export const POINTS_SYSTEM_START_DATE = '2026-09-01';

/** One tournament's data, in the shape computeTournamentChampionPersonIds needs. */
export type PointsTournament = {
  id: string;
  date: string; // ISO date, e.g. '2026-09-15'
  format: string;
  completedAt: string | null;
  matches: ChampionMatch[]; // every match row for this tournament, any stage/status
  teams: { id: string; person1Id: string; person2Id: string }[];
};

export type PointsEntry = {
  personId: string;
  totalPoints: number;
  matchWins: number;
  matchWinPoints: number;
  leagueWins: number;
  leagueWinPoints: number;
  matchesPlayed: number;
};

/**
 * Total Points leaderboard for one scope (e.g. a venue) over one date window.
 * Deliberately separate from and additive to the normalized composite scores
 * in locationLeaderboard.ts and playerOfTheMonth.ts -- this does not replace
 * or feed either of those.
 *
 * Pure recompute, like every other standings/champion function in this
 * codebase: never store the result. If a match score is corrected later, the
 * total must change on the next render, not leave a stale number behind.
 */
export function computePointsLeaderboard(params: {
  matches: RawMatch[]; // completed matches (any date) -- scoped internally by tournament
  teams: RawTeam[]; // people-id-space teams (any tournament) -- scoped internally
  tournaments: PointsTournament[];
  range: DateRange;
}): PointsEntry[] {
  const { matches, teams, tournaments, range } = params;

  // Clamp, not reject: a range that starts before the cutover (e.g. "August through
  // October") still returns points for the September-onward portion, rather than an
  // all-or-nothing empty result.
  const effectiveStart =
    range.start > POINTS_SYSTEM_START_DATE ? range.start : POINTS_SYSTEM_START_DATE;
  if (effectiveStart >= range.endExclusive) return [];

  const inRangeTournaments = tournaments.filter(
    (t) => t.date >= effectiveStart && t.date < range.endExclusive
  );
  const inRangeIds = new Set(inRangeTournaments.map((t) => t.id));

  const scopedTeams = teams.filter((t) => inRangeIds.has(t.tournamentId));
  const scopedMatches = matches.filter((m) => inRangeIds.has(m.tournamentId));

  // Reuses the exact same champion-detection function every other League Won stat in
  // this app uses -- never reimplemented. Both teammates get the full bonus in team
  // formats (computeTournamentChampionPersonIds already returns both ids); only one
  // person gets it for individual/ladder formats.
  const leagueWinsByPersonId = new Map<string, number>();
  for (const tournament of inRangeTournaments) {
    const championPersonIds = computeTournamentChampionPersonIds({
      format: tournament.format,
      completedAt: tournament.completedAt,
      matches: tournament.matches,
      teams: tournament.teams,
    });
    for (const personId of championPersonIds ?? []) {
      leagueWinsByPersonId.set(personId, (leagueWinsByPersonId.get(personId) ?? 0) + 1);
    }
  }

  const personIds = new Set<string>(leagueWinsByPersonId.keys());
  for (const t of scopedTeams) {
    personIds.add(t.player1PersonId);
    personIds.add(t.player2PersonId);
  }

  const entries: PointsEntry[] = [];
  for (const personId of personIds) {
    const records = buildPersonMatchRecords(personId, scopedMatches, scopedTeams);
    const matchWins = records.filter((r) => r.won).length;
    const matchesPlayed = records.length;
    const leagueWins = leagueWinsByPersonId.get(personId) ?? 0;

    // Matches the existing /locations leaderboard convention: only list people who
    // actually played in this window. A league-bonus-only edge case (a champion with
    // no counted match wins in scope) is not expected in practice -- a tournament
    // can't have a champion without complete matches to derive standings from.
    if (matchesPlayed === 0) continue;

    const matchWinPoints = matchWins * POINTS_PER_MATCH_WIN;
    const leagueWinPoints = leagueWins * POINTS_PER_LEAGUE_WIN;
    entries.push({
      personId,
      matchWins,
      matchWinPoints,
      leagueWins,
      leagueWinPoints,
      totalPoints: matchWinPoints + leagueWinPoints,
      matchesPlayed,
    });
  }

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
    return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
  });

  return entries;
}
