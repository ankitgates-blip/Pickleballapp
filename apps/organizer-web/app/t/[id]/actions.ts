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
  // Strip control characters/newlines -- a newline in a name would corrupt the
  // comma-joined WhatsApp share message and the PDF roster export. Length is checked
  // on the cleaned result, not the raw input, so a run of control characters that
  // collapses down to a normal-length name isn't rejected as "too long".
  // eslint-disable-next-line no-control-regex
  const name = rawName.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) {
    return { error: 'Please enter your name.' };
  }
  if (name.length > 50) {
    return { error: 'Name is too long (max 50 characters).' };
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
    console.error('joinLeague: players count query failed', countError);
    return { error: 'Could not sign you up right now — please try again.' };
  }

  if (isRosterFull(tournament.max_players, count ?? 0)) {
    return { error: 'This league is full.' };
  }

  const { data: existingPeople, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', tournament.organizer_id);

  if (peopleError) {
    console.error('joinLeague: people query failed', peopleError);
    return { error: 'Could not sign you up right now — please try again.' };
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
      console.error('joinLeague: person insert failed', insertPersonError);
      return { error: 'Could not sign you up right now — please try again.' };
    }
    personId = newPerson.id;
  }

  const { error: insertPlayerError } = await supabase
    .from('players')
    .insert({ tournament_id: tournamentId, name, person_id: personId });

  if (insertPlayerError) {
    console.error('joinLeague: player insert failed', insertPlayerError);
    return { error: 'Could not sign you up right now — please try again.' };
  }

  revalidatePath(`/t/${tournamentId}`);
  return { error: null };
}

export type SetRsvpState = { error: string | null };

// Public, unauthenticated RSVP -- same trust model as joinLeague above: deliberately does
// NOT call requireOrganizer(). The set_league_rsvp() Postgres function (SECURITY DEFINER,
// supabase/migrations/20260825150000_add_league_rsvps.sql) is the sole write path and does
// its own authorization (person belongs to this organizer, tournament is League Playoffs,
// not completed, cutoff not passed) -- its raise exception messages are short and
// organizer-authored, so returning error.message directly here is safe, unlike a raw
// PostgREST error would be.
export async function setLeagueRsvp(
  tournamentId: string,
  personId: string,
  _prevState: SetRsvpState,
  formData: FormData
): Promise<SetRsvpState> {
  const status = formData.get('status');
  if (status !== 'in' && status !== 'out' && status !== 'tentative') {
    return { error: 'Invalid response.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_league_rsvp', {
    p_tournament_id: tournamentId,
    p_person_id: personId,
    p_status: status,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/t/${tournamentId}`);
  return { error: null };
}
