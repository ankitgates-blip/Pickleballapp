'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export async function enterScore(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();

  const scoreA = Number(formData.get('scoreA'));
  const scoreB = Number(formData.get('scoreB'));

  const { error } = await supabase
    .from('matches')
    .update({ score_a: scoreA, score_b: scoreB, status: 'complete' })
    .eq('id', matchId);

  if (error) {
    throw new Error(error.message);
  }

  const { data: allMatches, error: matchesError } = await supabase
    .from('matches')
    .select('status')
    .eq('tournament_id', tournamentId)
    .not('team_b_id', 'is', null);

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const allComplete =
    (allMatches ?? []).length > 0 && (allMatches ?? []).every((m) => m.status === 'complete');

  if (allComplete) {
    const { error: completeError } = await supabase
      .from('tournaments')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', tournamentId)
      .is('completed_at', null);

    if (completeError) {
      throw new Error(completeError.message);
    }
  }

  revalidatePath(`/tournaments/${tournamentId}/matches`);
  revalidatePath(`/tournaments/${tournamentId}/standings`);
  revalidatePath('/tournaments');
}
