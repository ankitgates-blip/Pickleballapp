import {
  computeStandings,
  computeIndividualStandings,
  computeClaimTheThroneStandings,
} from './standings';
import { isIndividualFormat, isLadderFormat as isLadderFormatCheck } from './formats';
import type { ClaimTheThroneRoundResult, MatchResult, Team } from '@/lib/types';

type ChampionMatch = {
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
  const { format, completedAt, matches, teams } = params;

  if (!completedAt) {
    return {};
  }

  const isLadderFormat = isLadderFormatCheck(format);
  const isIndividual = isIndividualFormat(format);

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
  const championTeamId = !isIndividual
    ? finalMatch
      ? (finalMatch.score_a ?? 0) > (finalMatch.score_b ?? 0)
        ? finalMatch.team_a_id
        : finalMatch.team_b_id
      : standings[0]?.teamId
    : undefined;
  const championPlayerId = isLadderFormat
    ? ladderStandings[0]?.playerId
    : isIndividual
      ? individualStandings[0]?.playerId
      : undefined;

  return {
    teamId: championTeamId ?? undefined,
    playerId: championPlayerId ?? undefined,
  };
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
