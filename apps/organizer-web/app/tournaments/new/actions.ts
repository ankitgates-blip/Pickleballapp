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
  const venueId = formData.get('venueId') as string;
  const timeslot = formData.get('timeslot') as string;
  const popcornRounds = format === 'popcorn' ? Number(formData.get('popcornRounds')) : null;
  const gauntletRounds = format === 'gauntlet' ? Number(formData.get('gauntletRounds')) : null;
  const claimTheThroneRounds =
    format === 'claim_the_throne' ? Number(formData.get('claimTheThroneRounds')) : null;

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      date,
      target_score: targetScore,
      win_by: winBy,
      format,
      organizer_id: organizer.id,
      venue_id: venueId,
      timeslot,
      popcorn_rounds: popcornRounds,
      gauntlet_rounds: gauntletRounds,
      claim_the_throne_rounds: claimTheThroneRounds,
    })
    .select('id')
    .single();

  if (error || !tournament) {
    throw new Error(error?.message ?? 'Failed to create tournament');
  }

  redirect(`/tournaments/${tournament.id}/roster`);
}
