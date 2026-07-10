'use server';

import { redirect } from 'next/navigation';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';

export async function createTournament(formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const name = formData.get('name') as string;
  const date = formData.get('date') as string;
  const targetScore = Number(formData.get('targetScore'));
  const winBy = Number(formData.get('winBy'));
  const format = formData.get('format') as string;

  const { data: venue } = await supabase
    .from('venues')
    .select('id')
    .eq('name', 'Pickle Turf')
    .single();

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      date,
      target_score: targetScore,
      win_by: winBy,
      format,
      organizer_id: organizer.id,
      venue_id: venue!.id,
    })
    .select('id')
    .single();

  if (error || !tournament) {
    throw new Error(error?.message ?? 'Failed to create tournament');
  }

  redirect(`/tournaments/${tournament.id}/roster`);
}
