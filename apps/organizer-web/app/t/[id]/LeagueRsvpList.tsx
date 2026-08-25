import { createClient } from '@/lib/supabase/server';
import RsvpRow from './RsvpRow';

export default async function LeagueRsvpList({
  tournamentId,
  organizerId,
  isLocked,
  confirmedPersonIds,
}: {
  tournamentId: string;
  organizerId: string;
  isLocked: boolean;
  confirmedPersonIds: Set<string>;
}) {
  const supabase = await createClient();

  const { data: people } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizerId)
    .order('name', { ascending: true });

  const { data: rsvps } = await supabase
    .from('league_rsvps')
    .select('person_id, status, responded_at')
    .eq('tournament_id', tournamentId);

  const rsvpByPersonId = new Map((rsvps ?? []).map((r) => [r.person_id, r]));

  const waitingIds = (rsvps ?? [])
    .filter((r) => r.status === 'in' && !confirmedPersonIds.has(r.person_id))
    .sort((a, b) => new Date(a.responded_at).getTime() - new Date(b.responded_at).getTime())
    .map((r) => r.person_id);
  const waitingPositionByPersonId = new Map(waitingIds.map((id, i) => [id, i + 1]));

  return (
    <ul className="space-y-2">
      {(people ?? []).map((person) => {
        const rsvp = rsvpByPersonId.get(person.id);
        const status = (rsvp?.status ?? null) as 'in' | 'out' | 'tentative' | null;
        let statusLabel: string | null = null;
        if (confirmedPersonIds.has(person.id)) {
          statusLabel = 'Confirmed';
        } else if (status === 'in') {
          statusLabel = `Waiting — #${waitingPositionByPersonId.get(person.id)}`;
        } else if (status === 'tentative') {
          statusLabel = 'Tentative';
        } else if (status === 'out') {
          statusLabel = 'Out';
        }

        return (
          <RsvpRow
            key={person.id}
            tournamentId={tournamentId}
            personId={person.id}
            personName={person.name}
            currentStatus={status}
            statusLabel={statusLabel}
            isLocked={isLocked}
          />
        );
      })}
    </ul>
  );
}
