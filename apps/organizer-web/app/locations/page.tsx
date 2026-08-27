import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, headingClass } from '@/app/components/ui';
import EmptyState from '@/app/components/EmptyState';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computeLocationLeaderboard } from '@/lib/stats/locationLeaderboard';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import ThreatBadge from '@/app/components/ThreatBadge';
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import type { RawMatch, RawTeam } from '@/lib/stats/types';
import ShareLeaderboardButton from './ShareLeaderboardButton';

function PaddleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="9" rx="6" ry="7" stroke="currentColor" strokeWidth={2} />
      <path d="M12 16v6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M9 22h6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export default async function LocationsPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, date, venue_id, format, completed_at')
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
        .select('tournament_id, stage, round, court, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', tournamentIds)
    : { data: [] };

  const tournamentById = new Map((tournaments ?? []).map((t) => [t.id, t]));

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

  // Overall (not venue-scoped) win rate, computed once from data already fetched above,
  // for the Threat Level badge — separate from each venue's own winPercentage below.
  const allCompleteMatches: RawMatch[] = (matchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
      venueName: '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const overallWinPercentageByPersonId = new Map(
    (people ?? []).map((person) => [
      person.id,
      winPercentageFromRecords(buildPersonMatchRecords(person.id, allCompleteMatches, teams)),
    ])
  );

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

    // Uses the same champion-detection rules as the tournaments list page (final-match
    // winner when a final exists, individual/ladder standings for individual-pairing
    // formats, and only once the tournament is actually completed) — see
    // computeTournamentChampionPersonIds. Reimplementing this ad hoc previously credited
    // "League Won" to whoever's ephemeral per-round pairing happened to have the best
    // record in Popcorn/Gauntlet tournaments, which isn't how those formats crown a winner.
    const tournamentWinsByPersonId = new Map<string, number>();
    for (const tournamentId of venueTournamentIds) {
      const tournament = tournamentById.get(tournamentId);
      if (!tournament) continue;

      const tournamentTeams = teams
        .filter((t) => t.tournamentId === tournamentId)
        .map((t) => ({ id: t.id, person1Id: t.player1PersonId, person2Id: t.player2PersonId }));
      const tournamentMatches = (matchesRaw ?? []).filter((m) => m.tournament_id === tournamentId);

      const championPersonIds = computeTournamentChampionPersonIds({
        format: tournament.format,
        completedAt: tournament.completed_at,
        matches: tournamentMatches,
        teams: tournamentTeams,
      });

      for (const personId of championPersonIds ?? []) {
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

  const exportVenues = leaderboardsByVenue.map(({ venueName, leaderboard }) => ({
    venueName,
    rows: leaderboard.map((entry, i) => ({
      rank: i + 1,
      name: personNameById.get(entry.personId) ?? 'Unknown',
      leagueWins: entry.tournamentWins,
      matchesPlayed: entry.matchesPlayed,
      matchWins: entry.matchWins,
      losses: entry.losses,
      winPercentage: entry.winPercentage,
    })),
  }));

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className={`text-2xl ${headingClass} mb-6`}>Location Stats</h1>

      <ShareLeaderboardButton venues={exportVenues} />

      {leaderboardsByVenue.map(({ venueId, venueName, leaderboard }) => (
        <div key={venueId} className={`${cardClass} mb-6`}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">{venueName}</h2>
          {leaderboard.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {leaderboard.map((entry, i) => (
                <li key={entry.personId} className="border-b border-slate-100 pb-3 last:border-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/people/${entry.personId}`}
                      className={`flex items-center gap-2 font-semibold hover:underline ${i === 0 ? 'text-base text-slate-900' : 'text-slate-800'}`}
                    >
                      <span className="text-slate-500">{i + 1}.</span>
                      {personNameById.get(entry.personId) ?? 'Unknown'}
                    </Link>
                    <ThreatBadge
                      winPercentage={overallWinPercentageByPersonId.get(entry.personId) ?? null}
                    />
                    {entry.tournamentWins > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5">
                        🏆 {entry.tournamentWins} League Win{entry.tournamentWins === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <p className="stat-num mt-1 font-bold text-slate-900">
                    {entry.matchesPlayed} match{entry.matchesPlayed === 1 ? '' : 'es'} ·{' '}
                    {entry.matchWins} win{entry.matchWins === 1 ? '' : 's'} ·{' '}
                    {entry.losses} loss{entry.losses === 1 ? '' : 'es'}
                    {entry.winPercentage !== null && (
                      <span className="text-navy-mid"> · {entry.winPercentage}% winning</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<PaddleIcon />}>No matches played here yet.</EmptyState>
          )}
        </div>
      ))}
    </OrganizerShell>
  );
}
