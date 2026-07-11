'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export async function cancelTournament(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/tournaments');
}
