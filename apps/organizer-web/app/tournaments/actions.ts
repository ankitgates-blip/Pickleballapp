'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/supabase/requireOrganizer';

export async function cancelTournament(tournamentId: string) {
  const { supabase } = await requireOwner();

  const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/tournaments');
}
