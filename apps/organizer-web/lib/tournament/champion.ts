import {
  computeStandings,
  computeIndividualStandings,
  computeClaimTheThroneStandings,
} from './standings';
import { isIndividualFormat } from './formats';
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
  const { format, completedAt, matches, teams, players } = params;

  if (!completedAt) {
    return undefined;
  }

  const isLadderFormat = format === 'claim_the_throne' || format === 'up_and_down_the_river';
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
    player1Id: t.player_1_id,
    player2Id: t.player_2_id,
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
            teamAPlayerIds: [teamA.player_1_id, teamA.player_2_id] as [string, string],
            teamBPlayerIds: [teamB.player_1_id, teamB.player_2_id] as [string, string],
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

  const playerById = new Map(players.map((p) => [p.id, p.name]));
  const teamById = new Map(
    teams.map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  if (championPlayerId) {
    return playerById.get(championPlayerId);
  }
  if (championTeamId) {
    return teamById.get(championTeamId);
  }
  return undefined;
}
