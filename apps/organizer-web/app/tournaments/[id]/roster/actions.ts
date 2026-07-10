// apps/organizer-web/app/tournaments/[id]/roster/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { matchNamesToPeople } from '@/lib/people/matchNames';

export async function startAddPlayers(tournamentId: string, formData: FormData) {
  const raw = formData.get('names') as string;
  redirect(`/tournaments/${tournamentId}/roster?pendingNames=${encodeURIComponent(raw)}`);
}

export async function confirmAddPlayers(tournamentId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const raw = formData.get('names') as string;
  const names = raw
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (names.length === 0) {
    redirect(`/tournaments/${tournamentId}/roster`);
  }

  const { data: existingPeople, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);

  if (peopleError) {
    throw new Error(peopleError.message);
  }

  const { matched, newNames } = matchNamesToPeople(names, existingPeople ?? []);

  let createdPeople: Array<{ id: string; name: string }> = [];
  if (newNames.length > 0) {
    const { data, error } = await supabase
      .from('people')
      .insert(newNames.map((name) => ({ organizer_id: organizer.id, name })))
      .select('id, name');

    if (error) {
      throw new Error(error.message);
    }
    createdPeople = data ?? [];
  }

  const allAssignments = [
    ...matched,
    ...createdPeople.map((p) => ({ name: p.name, personId: p.id })),
  ];

  const { error: playersError } = await supabase.from('players').insert(
    allAssignments.map((a) => ({
      tournament_id: tournamentId,
      name: a.name,
      person_id: a.personId,
    }))
  );

  if (playersError) {
    throw new Error(playersError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/roster`);
  redirect(`/tournaments/${tournamentId}/roster`);
}
