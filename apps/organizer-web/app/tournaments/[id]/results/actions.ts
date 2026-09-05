'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/supabase/requireOrganizer';

export async function renameTournament(
  tournamentId: string,
  formData: FormData
): Promise<{ name: string }> {
  const { supabase } = await requireOwner();

  const rawName = (formData.get('name') as string | null)?.trim();
  if (!rawName) {
    throw new Error('League name cannot be empty.');
  }

  const { data, error } = await supabase
    .from('tournaments')
    .update({ name: rawName })
    .eq('id', tournamentId)
    .select('name')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to rename league.');
  }

  revalidatePath(`/tournaments/${tournamentId}/results`);
  revalidatePath(`/t/${tournamentId}`);

  return { name: data.name };
}
