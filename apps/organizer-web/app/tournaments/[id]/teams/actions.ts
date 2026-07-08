'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

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
