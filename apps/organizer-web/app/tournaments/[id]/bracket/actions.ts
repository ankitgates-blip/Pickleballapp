'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { generateRoundRobin } from '@/lib/tournament/roundRobin';

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

  const pairings = generateRoundRobin(teams.map((t) => t.id));

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
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
