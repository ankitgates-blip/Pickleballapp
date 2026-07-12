// apps/organizer-web/app/tournaments/[id]/bracket/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { generateRoundRobin, generateDoubleHeaderRoundRobin } from '@/lib/tournament/roundRobin';
import { generatePopcornSchedule } from '@/lib/tournament/popcorn';
import { generateSemifinals } from '@/lib/tournament/playoffs';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';

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

export async function generateSemifinalMatches(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: leagueMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const matchResults: MatchResult[] = (leagueMatches ?? []).map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);
  const pairings = generateSemifinals(standings.slice(0, 4));

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

export async function generateFinalMatch(tournamentId: string) {
  const { supabase } = await requireOrganizer();

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
