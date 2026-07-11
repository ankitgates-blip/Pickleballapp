// apps/organizer-web/app/people/[id]/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computePersonStats } from '@/lib/stats/personStats';
import { computeStandings } from '@/lib/tournament/standings';
import type { RawMatch, RawTeam, TournamentWon } from '@/lib/stats/types';
import type { MatchResult } from '@/lib/types';

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: person } = await supabase
    .from('people')
    .select('id, name')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();

  if (!person) {
    return (
      <OrganizerShell organizerName={organizer.name}>
        <p className="text-slate-500">Person not found.</p>
      </OrganizerShell>
    );
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date, venues(name)')
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
    : { data: [] };

  const personIdByPlayerId = new Map(
    (players ?? []).map((p) => [p.id, p.person_id as string | null])
  );
  const personNameById = new Map<string, string>();
  // Only need names for people who appear as opponents/partners; fetch once for this organizer.
  const { data: allPeople } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);
  for (const p of allPeople ?? []) {
    personNameById.set(p.id, p.name);
  }

  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const completeMatches: RawMatch[] = (matchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
      venueName: venueNameByTournamentId.get(m.tournament_id) ?? '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const records = buildPersonMatchRecords(person.id, completeMatches, teams);

  // Determine which tournaments this person's team won, reusing Increment 1.1's
  // tested computeStandings per tournament rather than re-deriving ranking logic here.
  const tournamentsWon: TournamentWon[] = [];
  for (const tournamentId of tournamentIds) {
    const tournamentTeams = teams.filter((t) => t.tournamentId === tournamentId);
    const myTeam = tournamentTeams.find(
      (t) => t.player1PersonId === person.id || t.player2PersonId === person.id
    );
    if (!myTeam) continue;

    const tournamentMatches: MatchResult[] = (matchesRaw ?? [])
      .filter((m) => m.tournament_id === tournamentId)
      .map((m) => ({
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id,
        scoreA: m.score_a,
        scoreB: m.score_b,
        status: m.status as 'pending' | 'complete',
      }));

    const standings = computeStandings(tournamentMatches);
    if (standings.length > 0 && standings[0].teamId === myTeam.id) {
      tournamentsWon.push({
        tournamentId,
        date: tournamentDateById.get(tournamentId) ?? '',
      });
    }
  }

  const stats = computePersonStats(records, tournamentsWon);
  const nameFor = (personId: string) => personNameById.get(personId) ?? 'Unknown';

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = stats.monthly.find((m) => m.period === currentMonthKey) ?? {
    gamesWon: 0,
    gamesLost: 0,
    tournamentsWon: 0,
  };

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-1">{person.name}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {stats.lastPlayedDate ? `Last played: ${stats.lastPlayedDate}` : 'No matches played yet'}
      </p>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">This Month</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-extrabold text-teal-700">
              {thisMonth.gamesWon}
            </div>
            <div className="text-xs text-slate-500">Games won</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-500">
              {thisMonth.gamesLost}
            </div>
            <div className="text-xs text-slate-500">Games lost</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-500">
              {thisMonth.tournamentsWon}
            </div>
            <div className="text-xs text-slate-500">Tournaments won</div>
          </div>
        </div>
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">By Location</h2>
        {stats.matchesByLocation.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {stats.matchesByLocation.map((l) => (
              <li
                key={l.location}
                className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
              >
                <span className="font-semibold text-slate-900">{l.location}</span>
                <span className="font-bold text-teal-700">{l.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400 text-sm">No matches played yet.</p>
        )}
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Head-to-Head</h2>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Toughest opponent:</span>{' '}
          {stats.toughestOpponent
            ? `${nameFor(stats.toughestOpponent.personId)} (${stats.toughestOpponent.wins}-${stats.toughestOpponent.losses})`
            : 'Not enough matches yet'}
        </p>
        <p className="text-sm text-slate-700 mt-1">
          <span className="font-semibold">Best partner:</span>{' '}
          {stats.bestPartner
            ? `${nameFor(stats.bestPartner.personId)} (${stats.bestPartner.wins}-${stats.bestPartner.losses})`
            : 'Not enough matches yet'}
        </p>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          Match History ({stats.matchHistory.length})
        </h2>
        <ul className="space-y-2 text-sm">
          {stats.matchHistory.map((m, i) => (
            <li key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
              <span>
                <span className="text-slate-400 mr-2">{m.tournamentDate}</span>
                with <span className="font-semibold">{nameFor(m.partnerId)}</span> vs{' '}
                <span className="font-semibold">
                  {nameFor(m.opponentIds[0])} / {nameFor(m.opponentIds[1])}
                </span>
              </span>
              <span className={m.won ? 'font-bold text-teal-700' : 'font-bold text-slate-400'}>
                {m.scoreFor}-{m.scoreAgainst}
              </span>
            </li>
          ))}
          {stats.matchHistory.length === 0 && (
            <li className="text-slate-400">No completed matches yet.</li>
          )}
        </ul>
      </div>
    </OrganizerShell>
  );
}
