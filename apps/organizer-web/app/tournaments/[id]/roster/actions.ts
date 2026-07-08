'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export async function addPlayers(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const raw = formData.get('names') as string;
  const names = raw
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (names.length === 0) return;

  const { error } = await supabase
    .from('players')
    .insert(names.map((name) => ({ tournament_id: tournamentId, name })));

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/roster`);
}
