// apps/organizer-web/app/tournaments/[id]/roster/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { matchNamesToPeople } from '@/lib/people/matchNames';
import { slotsRemaining } from '@/lib/tournament/capacity';

export async function startAddPlayers(tournamentId: string, formData: FormData) {
  const raw = formData.get('names') as string;
  redirect(`/tournaments/${tournamentId}/roster?pendingNames=${encodeURIComponent(raw)}`);
}

export async function addExistingPeople(tournamentId: string, formData: FormData) {
  const { supabase, organizer } = await requireOrganizer();

  const personIds = formData.getAll('personIds') as string[];
  if (personIds.length === 0) {
    redirect(`/tournaments/${tournamentId}/roster`);
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('max_players')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { count: currentPlayerCount, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    throw new Error(countError.message);
  }

  const remaining = slotsRemaining(tournament?.max_players ?? null, currentPlayerCount ?? 0);
  if (remaining !== null && personIds.length > remaining) {
    throw new Error(
      `Only ${remaining} slot${remaining === 1 ? '' : 's'} left — you tried to add ${personIds.length} players.`
    );
  }

  const { data: people, error: peopleError } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id)
    .in('id', personIds);

  if (peopleError) {
    throw new Error(peopleError.message);
  }

  const { error: playersError } = await supabase.from('players').insert(
    (people ?? []).map((p) => ({
      tournament_id: tournamentId,
      name: p.name,
      person_id: p.id,
    }))
  );

  if (playersError) {
    throw new Error(playersError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/roster`);
  redirect(`/tournaments/${tournamentId}/roster`);
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

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('max_players')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { count: currentPlayerCount, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    throw new Error(countError.message);
  }

  const remaining = slotsRemaining(tournament?.max_players ?? null, currentPlayerCount ?? 0);
  if (remaining !== null && names.length > remaining) {
    throw new Error(
      `Only ${remaining} slot${remaining === 1 ? '' : 's'} left — you tried to add ${names.length} players.`
    );
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

export async function removePlayer(tournamentId: string, playerId: string) {
  const { supabase } = await requireOrganizer();

  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('person_id')
    .eq('id', playerId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId);

  if (error) {
    throw new Error(error.message);
  }

  // A league_playoffs RSVP left at 'in' after the players row is gone would put this
  // person at the FRONT of the derived waiting list (their responded_at predates
  // everyone who joined normally) and silently re-add them the next time someone
  // confirmed drops to "out". No-op for every other tournament format (no league_rsvps
  // rows exist for them) and for players with no person_id. Logged rather than thrown --
  // the player removal itself already succeeded and should not be rolled back over this
  // secondary cleanup failing.
  if (player?.person_id) {
    const { error: rsvpError } = await supabase
      .from('league_rsvps')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('person_id', player.person_id);

    if (rsvpError) {
      console.error('removePlayer: failed to clear league_rsvps row', rsvpError);
    }
  }

  revalidatePath(`/tournaments/${tournamentId}/roster`);
  revalidatePath(`/tournaments/${tournamentId}/teams`);
}

export async function updateTournamentDetails(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const venueId = formData.get('venueId') as string;
  const timeslot = formData.get('timeslot') as string;
  const maxPlayersRaw = formData.get('maxPlayers') as string;
  const maxPlayers = maxPlayersRaw ? Number(maxPlayersRaw) : null;

  const { error } = await supabase
    .from('tournaments')
    .update({ venue_id: venueId, timeslot, max_players: maxPlayers })
    .eq('id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/roster`);
  revalidatePath('/tournaments');
}
