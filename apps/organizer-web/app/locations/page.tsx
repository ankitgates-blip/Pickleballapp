import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computeLocationLeaderboard } from '@/lib/stats/locationLeaderboard';
import { computeStandings } from '@/lib/tournament/standings';
import type { RawMatch, RawTeam } from '@/lib/stats/types';
import type { MatchResult } from '@/lib/types';

export default async function LocationsPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, date, venue_id')
    .eq('organizer_id', organizer.id);

  const { data: people } = await supabase
    .from('people')
    .select('id, name')
    .eq('organizer_id', organizer.id);

  const personNameById = new Map((people ?? []).map((p) => [p.id, p.name]));

  const tournamentIds = (tournaments ?? []).map((t) => t.id);
  const tournamentDateById = new Map((tournaments ?? []).map((t) => [t.id, t.date]));

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

  const teams: RawTeam[] = (teamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: t.tournament_id,
      player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const leaderboardsByVenue = (venues ?? []).map((venue) => {
    const venueTournamentIds = new Set(
      (tournaments ?? []).filter((t) => t.venue_id === venue.id).map((t) => t.id)
    );

    const venueCompleteMatches: RawMatch[] = (matchesRaw ?? [])
      .filter(
        (m) =>
          venueTournamentIds.has(m.tournament_id) && m.team_b_id !== null && m.status === 'complete'
      )
      .map((m) => ({
        tournamentId: m.tournament_id,
        tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
        venueName: venue.name,
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id!,
        scoreA: m.score_a ?? 0,
        scoreB: m.score_b ?? 0,
        status: 'complete' as const,
      }));

    const tournamentWinsByPersonId = new Map<string, number>();
    for (const tournamentId of venueTournamentIds) {
      const tournamentTeams = teams.filter((t) => t.tournamentId === tournamentId);
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
      if (standings.length === 0) continue;

      const winningTeam = tournamentTeams.find((t) => t.id === standings[0].teamId);
      if (!winningTeam) continue;

      for (const personId of [winningTeam.player1PersonId, winningTeam.player2PersonId]) {
        tournamentWinsByPersonId.set(personId, (tournamentWinsByPersonId.get(personId) ?? 0) + 1);
      }
    }

    const candidates = (people ?? [])
      .map((person) => {
        const records = buildPersonMatchRecords(person.id, venueCompleteMatches, teams);
        return {
          personId: person.id,
          matchWins: records.filter((r) => r.won).length,
          tournamentWins: tournamentWinsByPersonId.get(person.id) ?? 0,
          matchesPlayed: records.length,
        };
      })
      .filter((c) => c.matchesPlayed > 0);

    return {
      venueId: venue.id,
      venueName: venue.name,
      leaderboard: computeLocationLeaderboard(candidates),
    };
  });

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Location Stats</h1>

      {leaderboardsByVenue.map(({ venueId, venueName, leaderboard }) => (
        <div key={venueId} className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">{venueName}</h2>
          {leaderboard.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {leaderboard.map((entry, i) => {
                const medal = ['🥇', '🥈', '🥉'][i];
                return (
                  <li
                    key={entry.personId}
                    className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0"
                  >
                    <Link
                      href={`/people/${entry.personId}`}
                      className={`font-semibold hover:underline ${i === 0 ? 'text-base text-slate-900' : 'text-slate-800'}`}
                    >
                      {medal && <span className="mr-1.5">{medal}</span>}
                      {personNameById.get(entry.personId) ?? 'Unknown'}
                    </Link>
                    <span className="text-slate-500">
                      {entry.tournamentWins} tournament{entry.tournamentWins === 1 ? '' : 's'} won ·{' '}
                      {entry.matchWins} match{entry.matchWins === 1 ? '' : 'es'} won
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-slate-400 text-sm">No matches played here yet.</p>
          )}
        </div>
      ))}
    </OrganizerShell>
  );
}
