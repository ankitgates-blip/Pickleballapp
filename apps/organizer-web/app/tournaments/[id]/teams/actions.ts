'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { shuffleIntoTeams } from '@/lib/tournament/shuffle';

export async function pairTeam(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const player1Id = formData.get('player1Id') as string;
  const player2Id = formData.get('player2Id') as string;

  if (!player1Id || !player2Id || player1Id === player2Id) {
    throw new Error('Select two different players to pair');
  }

  const { error } = await supabase.from('teams').insert({
    tournament_id: tournamentId,
    player_1_id: player1Id,
    player_2_id: player2Id,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/teams`);
}

export async function shuffleRemaining(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersError) {
    throw new Error(playersError.message);
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('player_1_id, player_2_id')
    .eq('tournament_id', tournamentId);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const pairedPlayerIds = new Set(
    (teams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id])
  );
  const unpairedIds = (players ?? [])
    .map((p) => p.id)
    .filter((id) => !pairedPlayerIds.has(id));

  if (unpairedIds.length < 2) {
    return;
  }

  const newTeams = shuffleIntoTeams(unpairedIds);

  const { error } = await supabase.from('teams').insert(
    newTeams.map((t) => ({
      tournament_id: tournamentId,
      player_1_id: t.player1Id,
      player_2_id: t.player2Id,
    }))
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/teams`);
}

export async function removeTeam(tournamentId: string, teamId: string) {
  const { supabase } = await requireOrganizer();

  const { error } = await supabase.from('teams').delete().eq('id', teamId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/teams`);
}
