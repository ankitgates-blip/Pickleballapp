'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isRosterFull } from '@/lib/tournament/capacity';
import { matchNamesToPeople } from '@/lib/people/matchNames';

// Public, unauthenticated sign-up -- deliberately does NOT call requireOrganizer(). This
// is the only mutation in the app callable by an anonymous visitor; see the two
// `_public_signup` RLS policies (supabase/migrations/20260824180000) that make the
// underlying inserts possible.
export async function joinLeague(tournamentId: string, formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get('name') as string | null)?.trim();
  if (!name) {
    throw new Error('Please enter your name.');
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, organizer_id, max_players, completed_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError || !tournament) {
    throw new Error('League not found.');
  }
  if (tournament.completed_at) {
    throw new Error('This league has already finished.');
  }

  const { count, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    throw new Error(countError.message);
  }

  if (isRosterFull(tournament.max_players, count ?? 0)) {
    throw new Error('This league is full.');
  }

  const { data: existingPeople, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', tournament.organizer_id);

  if (peopleError) {
    throw new Error(peopleError.message);
  }

  const { matched, newNames } = matchNamesToPeople([name], existingPeople ?? []);

  let personId: string;
  if (matched.length > 0) {
    personId = matched[0].personId;
  } else {
    const { data: newPerson, error: insertPersonError } = await supabase
      .from('people')
      .insert({ organizer_id: tournament.organizer_id, name: newNames[0] })
      .select('id')
      .single();

    if (insertPersonError || !newPerson) {
      throw new Error(insertPersonError?.message ?? 'Could not sign you up.');
    }
    personId = newPerson.id;
  }

  const { error: insertPlayerError } = await supabase
    .from('players')
    .insert({ tournament_id: tournamentId, name, person_id: personId });

  if (insertPlayerError) {
    throw new Error(insertPlayerError.message);
  }

  revalidatePath(`/t/${tournamentId}`);
}
