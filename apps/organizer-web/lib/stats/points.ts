// apps/organizer-web/lib/stats/points.ts
import { buildPersonMatchRecords } from './buildPersonMatchRecords';
import { computeTournamentChampionPersonIds, computeTournamentRunnerUpPersonIds } from '@/lib/tournament/champion';
import type { ChampionMatch } from '@/lib/tournament/champion';
import type { DateRange } from './monthRange';
import type { RawMatch, RawTeam } from './types';

export const POINTS_PER_MATCH_WIN = 10;
// A losing side whose own final score reached 10 or higher (12-10, 13-11, 14-12...)
// necessarily passed through a 10-10 tie under standard win-by-2-to-11 rules -- only
// final scores are stored (no point-by-point play), so this is the honest signal
// available for "lost a match that went to at least 10-10".
export const POINTS_CLOSE_LOSS = 5;
export const POINTS_LEAGUE_WINNER = 25;
export const POINTS_LEAGUE_RUNNER_UP = 10;
export const POINTS_SHUTOUT_BONUS = 10;
// Awarded on top of the league-winner bonus when the champion(s) never lost a single
// match anywhere in that tournament. Matches only carry one date per whole tournament
// (no per-round/per-day date), so "without losing a single match that day" is scored
// as "without losing a single match in the whole league" -- the closest honest match
// to the intended rule with the data actually available.
export const POINTS_CLEAN_SWEEP_BONUS = 10;

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

/**
 * The whole points mechanism -- every point value and bonus above -- is scoped to
 * these two season-style formats only, not every format. This was a deliberate
 * organizer decision, not an oversight: Custom League and League + Playoffs are this
 * app's structured, multi-round formats where an incentive point system makes sense;
 * Round Robin/Popcorn/Gauntlet/etc. never earn Total Points under this system.
 */
export const POINTS_ELIGIBLE_FORMATS: readonly string[] = ['custom', 'league_playoffs'];

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
  closeLosses: number;
  closeLossPoints: number;
  leagueWins: number;
  leagueWinPoints: number;
  leagueRunnerUps: number;
  leagueRunnerUpPoints: number;
  shutoutWins: number;
  shutoutBonusPoints: number;
  cleanSweepBonuses: number;
  cleanSweepBonusPoints: number;
  matchesPlayed: number;
};

// Did this person go through this one tournament without a single loss? Scoped to
// just this tournament's own rows (not the person's whole in-range history) by
// filtering the already-scoped matches/teams down to one tournamentId, then reusing
// the same buildPersonMatchRecords everything else in this function is built on.
function wentUndefeatedInTournament(
  personId: string,
  tournamentId: string,
  scopedMatches: RawMatch[],
  scopedTeams: RawTeam[]
): boolean {
  const tournamentMatches = scopedMatches.filter((m) => m.tournamentId === tournamentId);
  const tournamentTeams = scopedTeams.filter((t) => t.tournamentId === tournamentId);
  const records = buildPersonMatchRecords(personId, tournamentMatches, tournamentTeams);
  return records.length > 0 && records.every((r) => r.won);
}

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
    (t) =>
      t.date >= effectiveStart &&
      t.date < range.endExclusive &&
      POINTS_ELIGIBLE_FORMATS.includes(t.format)
  );
  const inRangeIds = new Set(inRangeTournaments.map((t) => t.id));

  const scopedTeams = teams.filter((t) => inRangeIds.has(t.tournamentId));
  const scopedMatches = matches.filter((m) => inRangeIds.has(m.tournamentId));

  // Reuses the exact same champion/runner-up-detection functions every other League
  // Won stat in this app uses -- never reimplemented. Both teammates get the full
  // bonus in team formats (computeTournamentChampionPersonIds/
  // computeTournamentRunnerUpPersonIds already return both ids); only one person gets
  // it for individual/ladder formats.
  const leagueWinsByPersonId = new Map<string, number>();
  const leagueRunnerUpsByPersonId = new Map<string, number>();
  const cleanSweepBonusesByPersonId = new Map<string, number>();
  for (const tournament of inRangeTournaments) {
    const championPersonIds = computeTournamentChampionPersonIds({
      format: tournament.format,
      completedAt: tournament.completedAt,
      matches: tournament.matches,
      teams: tournament.teams,
    });
    for (const personId of championPersonIds ?? []) {
      leagueWinsByPersonId.set(personId, (leagueWinsByPersonId.get(personId) ?? 0) + 1);
      if (wentUndefeatedInTournament(personId, tournament.id, scopedMatches, scopedTeams)) {
        cleanSweepBonusesByPersonId.set(personId, (cleanSweepBonusesByPersonId.get(personId) ?? 0) + 1);
      }
    }

    const runnerUpPersonIds = computeTournamentRunnerUpPersonIds({
      format: tournament.format,
      completedAt: tournament.completedAt,
      matches: tournament.matches,
      teams: tournament.teams,
    });
    for (const personId of runnerUpPersonIds ?? []) {
      leagueRunnerUpsByPersonId.set(personId, (leagueRunnerUpsByPersonId.get(personId) ?? 0) + 1);
    }
  }

  const personIds = new Set<string>([
    ...leagueWinsByPersonId.keys(),
    ...leagueRunnerUpsByPersonId.keys(),
  ]);
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
    const leagueRunnerUps = leagueRunnerUpsByPersonId.get(personId) ?? 0;
    const cleanSweepBonuses = cleanSweepBonusesByPersonId.get(personId) ?? 0;

    // Matches the existing /locations leaderboard convention: only list people who
    // actually played in this window. A league-bonus-only edge case (a champion with
    // no counted match wins in scope) is not expected in practice -- a tournament
    // can't have a champion without complete matches to derive standings from.
    if (matchesPlayed === 0) continue;

    // A shutout win stacks per qualifying match, with no per-tournament cap -- a team
    // that wins two matches 11-0 in the same league earns the bonus twice. Checked from
    // the winner's own oriented scoreFor/scoreAgainst (not the match's raw, unoriented
    // score_a/score_b), so the losing side of an 11-0 game never qualifies.
    const shutoutWins = records.filter((r) => r.won && r.scoreFor === 11 && r.scoreAgainst === 0).length;

    // A close loss stacks per qualifying match too, same as a shutout win -- checked
    // from this person's own oriented scoreFor (their own final score), not the
    // match's raw, unoriented score_a/score_b.
    const closeLosses = records.filter((r) => !r.won && r.scoreFor >= 10).length;

    const matchWinPoints = matchWins * POINTS_PER_MATCH_WIN;
    const closeLossPoints = closeLosses * POINTS_CLOSE_LOSS;
    const leagueWinPoints = leagueWins * POINTS_LEAGUE_WINNER;
    const leagueRunnerUpPoints = leagueRunnerUps * POINTS_LEAGUE_RUNNER_UP;
    const shutoutBonusPoints = shutoutWins * POINTS_SHUTOUT_BONUS;
    const cleanSweepBonusPoints = cleanSweepBonuses * POINTS_CLEAN_SWEEP_BONUS;
    entries.push({
      personId,
      matchWins,
      matchWinPoints,
      closeLosses,
      closeLossPoints,
      leagueWins,
      leagueWinPoints,
      leagueRunnerUps,
      leagueRunnerUpPoints,
      shutoutWins,
      shutoutBonusPoints,
      cleanSweepBonuses,
      cleanSweepBonusPoints,
      totalPoints:
        matchWinPoints +
        closeLossPoints +
        leagueWinPoints +
        leagueRunnerUpPoints +
        shutoutBonusPoints +
        cleanSweepBonusPoints,
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
