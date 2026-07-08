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

  revalidatePath(`/tournaments/${tournamentId}/matches`);
  revalidatePath(`/tournaments/${tournamentId}/standings`);
}
