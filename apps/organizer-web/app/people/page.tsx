// apps/organizer-web/app/people/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import type { RawMatch, RawTeam } from '@/lib/stats/types';

export default async function PeopleListPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: people } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id)
    .order('name', { ascending: true });

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, date, venues(name)')
    .eq('organizer_id', organizer.id);

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));
  const venueNameByTournamentId = new Map(
    (tournaments ?? []).map((t) => {
      const venue = t.venues as { name: string } | { name: string }[] | null;
      const name = Array.isArray(venue)
        ? (venue[0]?.name ?? 'Pickle Turf')
        : (venue?.name ?? 'Pickle Turf');
      return [t.id, name];
    })
  );

  const { data: players } = tournamentIds.length
    ? await supabase
        .from('players')
        .select('id, tournament_id, person_id')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const { data: teamsRaw } = tournamentIds.length
    ? await supabase
        .from('teams')
        .select('id, tournament_id, player_1_id, player_2_id')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const { data: matchesRaw } = tournamentIds.length
    ? await supabase
        .from('matches')
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', tournamentIds)
        .not('team_b_id', 'is', null)
    : { data: [] };

  const personIdByPlayerId = new Map(
    (players ?? []).map((p) => [p.id, p.person_id as string | null])
  );

  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const matches: RawMatch[] = (matchesRaw ?? []).map((m) => ({
    tournamentId: m.tournament_id,
    tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
    venueName: venueNameByTournamentId.get(m.tournament_id) ?? '',
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id!,
    scoreA: m.score_a ?? 0,
    scoreB: m.score_b ?? 0,
    status: m.status as 'pending' | 'complete',
  }));

  const summaries = (people ?? []).map((person) => {
    const records = buildPersonMatchRecords(person.id, matches, teams);
    const wins = records.filter((r) => r.won).length;
    const losses = records.length - wins;
    const tournamentsPlayed = new Set(records.map((r) => r.tournamentId)).size;
    return { ...person, wins, losses, tournamentsPlayed };
  });

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Player Profiles</h1>

      {summaries.length === 0 && (
        <div className={`${cardClass} text-center text-slate-500`}>
          No people yet — they're created automatically the first time you add them to a
          tournament roster.
        </div>
      )}

      <ul className="space-y-3">
        {summaries.map((person) => (
          <li key={person.id}>
            <Link
              href={`/people/${person.id}`}
              className={`${cardClass} flex items-center justify-between hover:border-teal-400 transition-colors block`}
            >
              <span className="font-semibold text-slate-900">{person.name}</span>
              <span className="text-sm text-slate-500">
                {person.tournamentsPlayed} tournament{person.tournamentsPlayed === 1 ? '' : 's'} —{' '}
                {person.wins}-{person.losses}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </OrganizerShell>
  );
}
