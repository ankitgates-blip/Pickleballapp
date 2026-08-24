// apps/organizer-web/app/tournaments/[id]/bracket/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { generateRoundRobin, generateDoubleHeaderRoundRobin } from '@/lib/tournament/roundRobin';
import { generatePopcornSchedule } from '@/lib/tournament/popcorn';
import { generateGauntletRound } from '@/lib/tournament/gauntlet';
import { generateClaimTheThroneRound } from '@/lib/tournament/claimTheThrone';
import { generateUpAndDownRiverRound } from '@/lib/tournament/upAndDownTheRiver';
import { computeCustomAutoRound } from '@/lib/tournament/customAuto';
import type { CustomAutoMatch } from '@/lib/types';
import { generateSemifinals, pickFinalists, fillStandingsGaps } from '@/lib/tournament/playoffs';
import { computeStandings } from '@/lib/tournament/standings';
import { canEditScore, canEditTeams } from '@/lib/tournament/completion';
import type {
  MatchResult,
  GauntletRoundResult,
  ClaimTheThroneRoundResult,
  UpAndDownRiverRoundResult,
} from '@/lib/types';

export async function generateBracket(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format === 'custom') {
    throw new Error(
      'Custom League schedules are built manually — add matches one at a time instead.'
    );
  }

  const pairings =
    tournament?.format === 'double_header'
      ? generateDoubleHeaderRoundRobin(teams.map((t) => t.id))
      : generateRoundRobin(teams.map((t) => t.id));

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function generateLeaguePlayoffsBracket(tournamentId: string, formData?: FormData) {
  const { supabase } = await requireOrganizer();

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  const teamCount = teams.length;
  const fullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;

  const rawRounds = formData?.get('rounds');
  const requested =
    typeof rawRounds === 'string' && rawRounds.trim() !== '' ? Number(rawRounds) : NaN;
  const targetRounds = Number.isFinite(requested)
    ? Math.max(1, Math.min(fullRounds, Math.floor(requested)))
    : fullRounds;

  const { error: updateError } = await supabase
    .from('tournaments')
    .update({ league_playoffs_rounds: targetRounds })
    .eq('id', tournamentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const pairings = generateRoundRobin(teams.map((t) => t.id)).filter(
    (p) => p.round <= targetRounds
  );

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function regenerateLeaguePlayoffsBracket(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: playoffMatches, error: playoffError } = await supabase
    .from('matches')
    .select('stage')
    .eq('tournament_id', tournamentId)
    .in('stage', ['semifinal', 'final']);

  if (playoffError) {
    throw new Error(playoffError.message);
  }

  if (playoffMatches && playoffMatches.length > 0) {
    throw new Error('Playoffs have already started — cannot regenerate the League stage');
  }

  const { data: tournamentCompletion, error: completionError } = await supabase
    .from('tournaments')
    .select('completed_at')
    .eq('id', tournamentId)
    .single();

  if (completionError) {
    throw new Error(completionError.message);
  }

  if (tournamentCompletion?.completed_at) {
    throw new Error(
      'This tournament is already complete — the League schedule can no longer be regenerated.'
    );
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('league_playoffs_rounds')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const teamCount = teams.length;
  const fullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  const targetRounds = Math.max(
    1,
    Math.min(fullRounds, tournament?.league_playoffs_rounds ?? fullRounds)
  );

  const { error: deleteError } = await supabase
    .from('matches')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: updateError } = await supabase
    .from('tournaments')
    .update({ league_playoffs_rounds: targetRounds })
    .eq('id', tournamentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const pairings = generateRoundRobin(teams.map((t) => t.id)).filter(
    (p) => p.round <= targetRounds
  );

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

function pairKey(playerAId: string, playerBId: string): string {
  return [playerAId, playerBId].sort().join('|');
}

export async function generatePopcornBracket(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('popcorn_rounds')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const numRounds = tournament?.popcorn_rounds ?? 5;

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  if (!players || players.length < 4) {
    throw new Error('Need at least 4 players to generate a Popcorn schedule');
  }

  const pairings = generatePopcornSchedule(
    players.map((p) => p.id),
    numRounds
  );

  const { data: existingTeams, error: existingTeamsError } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', tournamentId);

  if (existingTeamsError) {
    throw new Error(existingTeamsError.message);
  }

  const teamIdByPairKey = new Map<string, string>();
  for (const t of existingTeams ?? []) {
    teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
  }

  const pairKeysNeeded = new Set<string>();
  for (const p of pairings) {
    pairKeysNeeded.add(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]));
    pairKeysNeeded.add(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]));
  }

  const newPairKeys = [...pairKeysNeeded].filter((key) => !teamIdByPairKey.has(key));

  if (newPairKeys.length > 0) {
    const { data: insertedTeams, error: insertTeamsError } = await supabase
      .from('teams')
      .insert(
        newPairKeys.map((key) => {
          const [player1Id, player2Id] = key.split('|');
          return { tournament_id: tournamentId, player_1_id: player1Id, player_2_id: player2Id };
        })
      )
      .select('id, player_1_id, player_2_id');

    if (insertTeamsError) {
      throw new Error(insertTeamsError.message);
    }

    for (const t of insertedTeams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }
  }

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function advanceGauntletRound(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('gauntlet_rounds')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  if (!players || players.length < 4) {
    throw new Error('Need at least 4 players to generate a Gauntlet round');
  }

  const playerIds = players.map((p) => p.id);

  const { data: existingTeams, error: existingTeamsError } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', tournamentId);

  if (existingTeamsError) {
    throw new Error(existingTeamsError.message);
  }

  const teamById = new Map((existingTeams ?? []).map((t) => [t.id, t]));
  const teamIdByPairKey = new Map<string, string>();
  for (const t of existingTeams ?? []) {
    teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
  }

  const { data: existingMatches, error: existingMatchesError } = await supabase
    .from('matches')
    .select('round, team_a_id, team_b_id, score_a, score_b')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (existingMatchesError) {
    throw new Error(existingMatchesError.message);
  }

  const previousRounds: GauntletRoundResult[] = (existingMatches ?? [])
    .filter((m) => m.team_b_id !== null)
    .map((m) => {
      const teamA = teamById.get(m.team_a_id!)!;
      const teamB = teamById.get(m.team_b_id!)!;
      return {
        round: m.round,
        teamAPlayerIds: [teamA.player_1_id, teamA.player_2_id] as [string, string],
        teamBPlayerIds: [teamB.player_1_id, teamB.player_2_id] as [string, string],
        scoreA: m.score_a ?? 0,
        scoreB: m.score_b ?? 0,
      };
    });

  const nextRound =
    previousRounds.length > 0 ? Math.max(...previousRounds.map((r) => r.round)) + 1 : 1;

  const pairings = generateGauntletRound(playerIds, previousRounds);

  const pairKeysNeeded = new Set<string>();
  for (const p of pairings) {
    pairKeysNeeded.add(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]));
    pairKeysNeeded.add(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]));
  }

  const newPairKeys = [...pairKeysNeeded].filter((key) => !teamIdByPairKey.has(key));

  if (newPairKeys.length > 0) {
    const { data: insertedTeams, error: insertTeamsError } = await supabase
      .from('teams')
      .insert(
        newPairKeys.map((key) => {
          const [player1Id, player2Id] = key.split('|');
          return { tournament_id: tournamentId, player_1_id: player1Id, player_2_id: player2Id };
        })
      )
      .select('id, player_1_id, player_2_id');

    if (insertTeamsError) {
      throw new Error(insertTeamsError.message);
    }

    for (const t of insertedTeams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }
  }

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function advanceClaimTheThroneRound(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('claim_the_throne_rounds')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  if (!players || players.length === 0 || players.length % 4 !== 0) {
    throw new Error('Claim the Throne requires a player count that is a positive multiple of 4');
  }

  const playerIds = players.map((p) => p.id);

  const { data: existingTeams, error: existingTeamsError } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', tournamentId);

  if (existingTeamsError) {
    throw new Error(existingTeamsError.message);
  }

  const teamById = new Map((existingTeams ?? []).map((t) => [t.id, t]));
  const teamIdByPairKey = new Map<string, string>();
  for (const t of existingTeams ?? []) {
    teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
  }

  const { data: existingMatches, error: existingMatchesError } = await supabase
    .from('matches')
    .select('round, court, team_a_id, team_b_id, score_a, score_b')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (existingMatchesError) {
    throw new Error(existingMatchesError.message);
  }

  const allMatches = existingMatches ?? [];
  const currentRound = allMatches.length > 0 ? Math.max(...allMatches.map((m) => m.round)) : 0;
  const nextRound = currentRound + 1;

  const previousRoundMatches: ClaimTheThroneRoundResult[] = allMatches
    .filter((m) => m.round === currentRound && m.team_b_id !== null)
    .map((m) => {
      const teamA = teamById.get(m.team_a_id!)!;
      const teamB = teamById.get(m.team_b_id!)!;
      return {
        court: m.court!,
        teamAPlayerIds: [teamA.player_1_id, teamA.player_2_id] as [string, string],
        teamBPlayerIds: [teamB.player_1_id, teamB.player_2_id] as [string, string],
        scoreA: m.score_a ?? 0,
        scoreB: m.score_b ?? 0,
      };
    });

  const pairings = generateClaimTheThroneRound(playerIds, previousRoundMatches);

  const pairKeysNeeded = new Set<string>();
  for (const p of pairings) {
    pairKeysNeeded.add(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]));
    pairKeysNeeded.add(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]));
  }

  const newPairKeys = [...pairKeysNeeded].filter((key) => !teamIdByPairKey.has(key));

  if (newPairKeys.length > 0) {
    const { data: insertedTeams, error: insertTeamsError } = await supabase
      .from('teams')
      .insert(
        newPairKeys.map((key) => {
          const [player1Id, player2Id] = key.split('|');
          return { tournament_id: tournamentId, player_1_id: player1Id, player_2_id: player2Id };
        })
      )
      .select('id, player_1_id, player_2_id');

    if (insertTeamsError) {
      throw new Error(insertTeamsError.message);
    }

    for (const t of insertedTeams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }
  }

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      court: p.court,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function advanceUpAndDownRiverRound(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('up_and_down_the_river_rounds')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  if (!players || players.length === 0 || players.length % 4 !== 0) {
    throw new Error(
      'Up and Down the River requires a player count that is a positive multiple of 4'
    );
  }

  const playerIds = players.map((p) => p.id);

  const { data: existingTeams, error: existingTeamsError } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', tournamentId);

  if (existingTeamsError) {
    throw new Error(existingTeamsError.message);
  }

  const teamById = new Map((existingTeams ?? []).map((t) => [t.id, t]));
  const teamIdByPairKey = new Map<string, string>();
  for (const t of existingTeams ?? []) {
    teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
  }

  const { data: existingMatches, error: existingMatchesError } = await supabase
    .from('matches')
    .select('round, court, team_a_id, team_b_id, score_a, score_b')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (existingMatchesError) {
    throw new Error(existingMatchesError.message);
  }

  const allMatches = existingMatches ?? [];
  const currentRound = allMatches.length > 0 ? Math.max(...allMatches.map((m) => m.round)) : 0;
  const nextRound = currentRound + 1;

  // Unlike Claim the Throne, this format needs the FULL round history (not just the most
  // recent round), since the cumulative-record tiebreak requires every prior round's results.
  const previousRounds: UpAndDownRiverRoundResult[] = allMatches
    .filter((m) => m.team_b_id !== null)
    .map((m) => {
      const teamA = teamById.get(m.team_a_id!)!;
      const teamB = teamById.get(m.team_b_id!)!;
      return {
        round: m.round,
        court: m.court!,
        teamAPlayerIds: [teamA.player_1_id, teamA.player_2_id] as [string, string],
        teamBPlayerIds: [teamB.player_1_id, teamB.player_2_id] as [string, string],
        scoreA: m.score_a ?? 0,
        scoreB: m.score_b ?? 0,
      };
    });

  const pairings = generateUpAndDownRiverRound(playerIds, previousRounds);

  const pairKeysNeeded = new Set<string>();
  for (const p of pairings) {
    pairKeysNeeded.add(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]));
    pairKeysNeeded.add(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]));
  }

  const newPairKeys = [...pairKeysNeeded].filter((key) => !teamIdByPairKey.has(key));

  if (newPairKeys.length > 0) {
    const { data: insertedTeams, error: insertTeamsError } = await supabase
      .from('teams')
      .insert(
        newPairKeys.map((key) => {
          const [player1Id, player2Id] = key.split('|');
          return { tournament_id: tournamentId, player_1_id: player1Id, player_2_id: player2Id };
        })
      )
      .select('id, player_1_id, player_2_id');

    if (insertTeamsError) {
      throw new Error(insertTeamsError.message);
    }

    for (const t of insertedTeams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }
  }

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      court: p.court,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function generateSemifinalMatches(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { count: existingPlayoffMatches, error: existingError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .in('stage', ['semifinal', 'final']);

  if (existingError) {
    throw new Error(existingError.message);
  }

  if ((existingPlayoffMatches ?? 0) > 0) {
    throw new Error('Semifinals or a final already exist for this tournament.');
  }

  const { data: leagueMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league')
    .order('round', { ascending: true });

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const { data: teamsData, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const matchResults: MatchResult[] = (leagueMatches ?? []).map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);
  const teamIds = (teamsData ?? []).map((t) => t.id);
  const completeStandings = fillStandingsGaps(standings, teamIds);
  const pairings = generateSemifinals(completeStandings.slice(0, 4));

  const { error: insertError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: 1,
      stage: 'semifinal' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function skipToFinalMatch(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { count: existingPlayoffMatches, error: existingError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .in('stage', ['semifinal', 'final']);

  if (existingError) {
    throw new Error(existingError.message);
  }

  if ((existingPlayoffMatches ?? 0) > 0) {
    throw new Error('Semifinals or a final already exist for this tournament.');
  }

  const { data: leagueMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league')
    .order('round', { ascending: true });

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const { data: teamsData, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const matchResults: MatchResult[] = (leagueMatches ?? []).map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);
  const teamIds = (teamsData ?? []).map((t) => t.id);
  const completeStandings = fillStandingsGaps(standings, teamIds);
  const { teamAId, teamBId } = pickFinalists(completeStandings);

  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function generateFinalMatch(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { count: existingFinalMatches, error: existingError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('stage', 'final');

  if (existingError) {
    throw new Error(existingError.message);
  }

  if ((existingFinalMatches ?? 0) > 0) {
    throw new Error('A final already exists for this tournament.');
  }

  const { data: semifinalMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'semifinal');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  if (
    !semifinalMatches ||
    semifinalMatches.length !== 2 ||
    semifinalMatches.some((m) => m.status !== 'complete')
  ) {
    throw new Error('Both semifinal matches must be complete before generating the final');
  }

  const winners = semifinalMatches.map((m) =>
    (m.score_a ?? 0) > (m.score_b ?? 0) ? m.team_a_id! : m.team_b_id!
  );

  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: winners[0],
    team_b_id: winners[1],
    status: 'pending' as const,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function updateMatchTeams(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (!canEditTeams(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error(
      'Team changes are only allowed once the tournament is complete and editing is unlocked.'
    );
  }

  const teamAId = formData.get('teamAId');
  const teamBId = formData.get('teamBId');

  if (typeof teamAId !== 'string' || typeof teamBId !== 'string' || !teamAId || !teamBId) {
    throw new Error('Both teams must be selected');
  }

  if (teamAId === teamBId) {
    throw new Error('Team A and Team B must be different teams');
  }

  const { data: validTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .in('id', [teamAId, teamBId]);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const validIds = new Set((validTeams ?? []).map((t) => t.id));
  if (!validIds.has(teamAId) || !validIds.has(teamBId)) {
    throw new Error('Selected teams must belong to this tournament');
  }

  const { error } = await supabase
    .from('matches')
    .update({ team_a_id: teamAId, team_b_id: teamBId })
    .eq('id', matchId)
    .eq('tournament_id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function addCustomMatch(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Matches can only be added manually for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to add a match.');
  }

  const targetRounds = tournament?.custom_rounds ?? 5;
  const roundRaw = formData.get('round');
  const round = typeof roundRaw === 'string' ? Number(roundRaw) : NaN;

  if (!Number.isInteger(round) || round < 1 || round > targetRounds) {
    throw new Error(`Round must be a whole number between 1 and ${targetRounds}`);
  }

  const teamAId = formData.get('teamAId');
  const teamBId = formData.get('teamBId');

  if (typeof teamAId !== 'string' || typeof teamBId !== 'string' || !teamAId || !teamBId) {
    throw new Error('Both teams must be selected');
  }

  if (teamAId === teamBId) {
    throw new Error('Team A and Team B must be different teams');
  }

  const { data: validTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .in('id', [teamAId, teamBId]);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const validIds = new Set((validTeams ?? []).map((t) => t.id));
  if (!validIds.has(teamAId) || !validIds.has(teamBId)) {
    throw new Error('Selected teams must belong to this tournament');
  }

  const { error } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round,
    stage: 'league' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function autoGenerateCustomRound(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Auto-generate is only available for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to auto-generate a round.');
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to auto-generate a round.');
  }

  const { data: existingMatchesRaw, error: matchesError } = await supabase
    .from('matches')
    .select('round, team_a_id, team_b_id')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const existingMatches: CustomAutoMatch[] = (existingMatchesRaw ?? [])
    .filter((m) => m.team_b_id !== null)
    .map((m) => ({ round: m.round, teamAId: m.team_a_id!, teamBId: m.team_b_id! }));

  const nextRound =
    existingMatches.length > 0 ? Math.max(...existingMatches.map((m) => m.round)) + 1 : 1;

  const targetRounds = tournament?.custom_rounds ?? 5;
  if (nextRound > targetRounds) {
    throw new Error(`All ${targetRounds} round${targetRounds === 1 ? '' : 's'} already have matches.`);
  }

  const pairings = computeCustomAutoRound(teams, existingMatches, nextRound);

  const { error: insertError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function unlockTournamentResults(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('completed_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (!tournament?.completed_at) {
    throw new Error('Editing can only be unlocked once the tournament is complete');
  }

  const { error } = await supabase
    .from('tournaments')
    .update({ results_unlocked_at: new Date().toISOString() })
    .eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function lockTournamentResults(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { error } = await supabase
    .from('tournaments')
    .update({ results_unlocked_at: null })
    .eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
