import {
  computeStandings,
  computeIndividualStandings,
  computeClaimTheThroneStandings,
} from './standings';
import { usesIndividualStandings, isLadderFormat as isLadderFormatCheck } from './formats';
import type { ClaimTheThroneRoundResult, MatchResult, Team } from '@/lib/types';

export type ChampionMatch = {
  stage: string;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  status: string;
  round: number;
  court: number | null;
};

// Generic team shape: id + two member ids. The member-id space is whatever the
// caller wants back out of computeChampionCore (players.id for the name-lookup
// path below, people.id for the cross-tournament person-id path) — the standings
// math never inspects what the ids mean.
type CoreTeam = { id: string; member1Id: string; member2Id: string };

type StandingsInfo = {
  useTeamChampion: boolean;
  finalMatch: ChampionMatch | undefined;
  standings: ReturnType<typeof computeStandings>;
  individualStandings: ReturnType<typeof computeIndividualStandings>;
  isLadderFormat: boolean;
  ladderStandings: ReturnType<typeof computeClaimTheThroneStandings>;
  teams: CoreTeam[];
};

// Computes every standings view a tournament might need its result read from, without
// picking a rank yet -- shared by computeChampionCore (rank 0) and
// computeRunnerUpCore (rank 1) so "who finished 2nd" reuses the exact same
// final-match/individual-standings/ladder-standings branching as "who won", not a
// parallel reimplementation that could quietly disagree with it.
function computeStandingsInfo(params: {
  format: string;
  completedAt: string | null;
  matches: ChampionMatch[];
  teams: CoreTeam[];
}): StandingsInfo | null {
  const { format, completedAt, matches, teams } = params;

  if (!completedAt) {
    return null;
  }

  const isLadderFormat = isLadderFormatCheck(format);
  const isIndividual = usesIndividualStandings(format);

  const leagueMatches = matches.filter((m) => m.stage === 'league');
  const finalMatches = matches.filter((m) => m.stage === 'final');

  const leagueMatchResults: MatchResult[] = leagueMatches.map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(leagueMatchResults);

  const teamsForIndividual: Team[] = teams.map((t) => ({
    id: t.id,
    tournamentId: '',
    player1Id: t.member1Id,
    player2Id: t.member2Id,
  }));
  const individualStandings = isIndividual && !isLadderFormat
    ? computeIndividualStandings(leagueMatchResults, teamsForIndividual)
    : [];

  const teamById2 = new Map(teams.map((t) => [t.id, t]));
  const ladderMatches: ClaimTheThroneRoundResult[] = isLadderFormat
    ? leagueMatches
        .filter(
          (m): m is typeof m & { team_a_id: string; team_b_id: string; court: number; score_a: number; score_b: number } =>
            m.status === 'complete' &&
            m.team_a_id !== null &&
            m.team_b_id !== null &&
            m.court !== null &&
            m.score_a !== null &&
            m.score_b !== null
        )
        .map((m) => {
          const teamA = teamById2.get(m.team_a_id)!;
          const teamB = teamById2.get(m.team_b_id)!;
          return {
            court: m.court,
            teamAPlayerIds: [teamA.member1Id, teamA.member2Id] as [string, string],
            teamBPlayerIds: [teamB.member1Id, teamB.member2Id] as [string, string],
            scoreA: m.score_a,
            scoreB: m.score_b,
          };
        })
    : [];
  const numCourts = ladderMatches.length > 0
    ? Math.max(...ladderMatches.map((m) => m.court))
    : 0;
  const ladderStandings = isLadderFormat
    ? computeClaimTheThroneStandings(ladderMatches, numCourts)
    : [];

  const finalMatch = finalMatches[0];
  // Custom League's standings are always individual (see usesIndividualStandings),
  // but a Custom League that opted into the fixed-teams playoffs feature has a real
  // Final match decide the winner, same as League + Playoffs -- so once that match
  // exists, the champion comes from it (the winning pair) rather than from
  // pre-playoffs individual standings. A Custom League that never generated a Final
  // keeps its existing individual-standings-based champion, unchanged.
  const useTeamChampion = !isIndividual || (format === 'custom' && Boolean(finalMatch));

  return { useTeamChampion, finalMatch, standings, individualStandings, isLadderFormat, ladderStandings, teams };
}

// Picks the team/player at a given 0-based rank (0 = winner, 1 = runner-up) from an
// already-computed StandingsInfo. A Final match only ever distinguishes rank 0 (its
// winner) and rank 1 (its loser) -- there's no "3rd place" to read off a single match,
// so any rank beyond 1 in a Final-decided tournament returns nothing.
function pickAtRank(info: StandingsInfo, rank: 0 | 1): { teamId?: string; playerId?: string } {
  if (info.isLadderFormat) {
    return { playerId: info.ladderStandings[rank]?.playerId ?? undefined };
  }

  if (info.useTeamChampion) {
    if (info.finalMatch) {
      const aWon = (info.finalMatch.score_a ?? 0) > (info.finalMatch.score_b ?? 0);
      const winnerId = aWon ? info.finalMatch.team_a_id : info.finalMatch.team_b_id;
      const loserId = aWon ? info.finalMatch.team_b_id : info.finalMatch.team_a_id;
      return { teamId: (rank === 0 ? winnerId : loserId) ?? undefined };
    }
    return { teamId: info.standings[rank]?.teamId ?? undefined };
  }

  if (rank === 0) {
    return { playerId: info.individualStandings[0]?.playerId ?? undefined };
  }

  // Individual standings with no Final (Custom League's default mode): a fixed
  // doubles pair shares an identical record all season, so the very next row in
  // individualStandings is often the CHAMPION'S OWN teammate, not a distinct 2nd
  // place. Skip anyone who was ever teamed with the champion before picking the
  // runner-up, so the bonus goes to a genuinely different result.
  const championId = info.individualStandings[0]?.playerId;
  if (!championId) return {};
  const championPartnerIds = new Set(
    info.teams
      .filter((t) => t.member1Id === championId || t.member2Id === championId)
      .flatMap((t) => [t.member1Id, t.member2Id])
  );
  const runnerUp = info.individualStandings.find(
    (s) => s.playerId !== championId && !championPartnerIds.has(s.playerId)
  );
  return { playerId: runnerUp?.playerId ?? undefined };
}

/**
 * Single source of truth for "who actually won this tournament" — shared by
 * computeTournamentChampionName (players.id space, for display) and
 * computeTournamentChampionPersonIds (people.id space, for cross-tournament
 * stats like League Wins). Do not reimplement this logic elsewhere.
 */
function computeChampionCore(params: {
  format: string;
  completedAt: string | null;
  matches: ChampionMatch[];
  teams: CoreTeam[];
}): { teamId?: string; playerId?: string } {
  const info = computeStandingsInfo(params);
  return info ? pickAtRank(info, 0) : {};
}

// Same rules as computeChampionCore, one rank down -- the tournament's runner-up
// (people.id space). Used for the League Runner-Up points bonus; see
// computeTournamentRunnerUpPersonIds below for the public entry point.
function computeRunnerUpCore(params: {
  format: string;
  completedAt: string | null;
  matches: ChampionMatch[];
  teams: CoreTeam[];
}): { teamId?: string; playerId?: string } {
  const info = computeStandingsInfo(params);
  return info ? pickAtRank(info, 1) : {};
}

type ChampionTeam = {
  id: string;
  player_1_id: string;
  player_2_id: string;
};

type ChampionPlayer = {
  id: string;
  name: string;
};

export function computeTournamentChampionName(params: {
  format: string;
  completedAt: string | null;
  matches: ChampionMatch[];
  teams: ChampionTeam[];
  players: ChampionPlayer[];
}): string | undefined {
  const { teams, players, ...rest } = params;
  const coreTeams: CoreTeam[] = teams.map((t) => ({
    id: t.id,
    member1Id: t.player_1_id,
    member2Id: t.player_2_id,
  }));

  const { teamId, playerId } = computeChampionCore({ ...rest, teams: coreTeams });

  const playerById = new Map(players.map((p) => [p.id, p.name]));

  if (playerId) {
    return playerById.get(playerId);
  }
  if (teamId) {
    const team = coreTeams.find((t) => t.id === teamId);
    if (!team) return undefined;
    return `${playerById.get(team.member1Id)} / ${playerById.get(team.member2Id)}`;
  }
  return undefined;
}

// Cross-tournament version of the same logic (e.g. for a "League Wins" leaderboard
// stat spanning many tournaments): same champion-detection rules, but the teams
// passed in are already in people.id space (person1Id/person2Id) rather than
// players.id space, so the result can be matched against a people.id-keyed map
// without any players-table lookup. Returns 1 person id for individual/ladder
// formats, 2 for team-based formats (both members of the winning team), or
// undefined if the tournament isn't complete or has no determinable winner.
export function computeTournamentChampionPersonIds(params: {
  format: string;
  completedAt: string | null;
  matches: ChampionMatch[];
  teams: { id: string; person1Id: string; person2Id: string }[];
}): string[] | undefined {
  const coreTeams: CoreTeam[] = params.teams.map((t) => ({
    id: t.id,
    member1Id: t.person1Id,
    member2Id: t.person2Id,
  }));

  const { teamId, playerId } = computeChampionCore({ ...params, teams: coreTeams });

  if (playerId) return [playerId];
  if (teamId) {
    const team = coreTeams.find((t) => t.id === teamId);
    if (!team) return undefined;
    return [team.member1Id, team.member2Id];
  }
  return undefined;
}

// Cross-tournament runner-up version of computeTournamentChampionPersonIds -- same
// completion/format rules, one rank down. Returns 1 person id for individual/ladder
// formats, 2 for team-based formats (both members of the runner-up team), or
// undefined if the tournament isn't complete or has no determinable runner-up (e.g.
// a team format with fewer than 2 teams, or a ladder result too short to have a
// 2nd place).
export function computeTournamentRunnerUpPersonIds(params: {
  format: string;
  completedAt: string | null;
  matches: ChampionMatch[];
  teams: { id: string; person1Id: string; person2Id: string }[];
}): string[] | undefined {
  const coreTeams: CoreTeam[] = params.teams.map((t) => ({
    id: t.id,
    member1Id: t.person1Id,
    member2Id: t.person2Id,
  }));

  const { teamId, playerId } = computeRunnerUpCore({ ...params, teams: coreTeams });

  if (playerId) return [playerId];
  if (teamId) {
    const team = coreTeams.find((t) => t.id === teamId);
    if (!team) return undefined;
    return [team.member1Id, team.member2Id];
  }
  return undefined;
}
