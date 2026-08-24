'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isRosterFull } from '@/lib/tournament/capacity';
import { matchNamesToPeople } from '@/lib/people/matchNames';

export type JoinLeagueState = { error: string | null };

// Public, unauthenticated sign-up -- deliberately does NOT call requireOrganizer(). This
// is the only mutation in the app callable by an anonymous visitor; see the
// `_public_signup` RLS policies (supabase/migrations/20260824180000,
// 20260824190000) that make the underlying inserts possible, column-scoped to exactly
// what this action sets.
//
// Returns { error } instead of throwing: Next.js masks Server Action error messages in
// production builds, so a thrown "This league is full." would reach the visitor as a
// full-screen generic crash page instead of an inline message. Returning state and
// reading it via useActionState (see JoinLeagueForm.tsx) keeps every message readable.
export async function joinLeague(
  tournamentId: string,
  _prevState: JoinLeagueState,
  formData: FormData
): Promise<JoinLeagueState> {
  const rawName = (formData.get('name') as string | null)?.trim();
  if (!rawName) {
    return { error: 'Please enter your name.' };
  }
  if (rawName.length > 50) {
    return { error: 'Name is too long (max 50 characters).' };
  }
  // Strip control characters/newlines -- a newline in a name would corrupt the
  // comma-joined WhatsApp share message and the PDF roster export.
  // eslint-disable-next-line no-control-regex
  const name = rawName.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) {
    return { error: 'Please enter your name.' };
  }

  const supabase = await createClient();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, organizer_id, max_players, completed_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError || !tournament) {
    return { error: 'League not found.' };
  }
  if (tournament.completed_at) {
    return { error: 'This league has already finished.' };
  }

  const { count, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    return { error: countError.message };
  }

  if (isRosterFull(tournament.max_players, count ?? 0)) {
    return { error: 'This league is full.' };
  }

  const { data: existingPeople, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', tournament.organizer_id);

  if (peopleError) {
    return { error: peopleError.message };
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
      return { error: insertPersonError?.message ?? 'Could not sign you up.' };
    }
    personId = newPerson.id;
  }

  const { error: insertPlayerError } = await supabase
    .from('players')
    .insert({ tournament_id: tournamentId, name, person_id: personId });

  if (insertPlayerError) {
    return { error: insertPlayerError.message };
  }

  revalidatePath(`/t/${tournamentId}`);
  return { error: null };
}
