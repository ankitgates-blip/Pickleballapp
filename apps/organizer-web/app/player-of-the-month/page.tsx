// apps/organizer-web/app/player-of-the-month/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { lockMissingPlayerOfTheMonthWinners } from './lockMissingWinners';
import { rankMonthlyCandidates } from '@/lib/stats/playerOfTheMonth';
import { buildMonthlyCandidates } from '@/lib/stats/monthlyCandidates';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import { longestWinStreak } from '@/lib/stats/winStreak';
import { winsInLastN } from '@/lib/stats/winsInLastN';
import { winsVsHigherRated } from '@/lib/stats/winsVsHigherRated';
import { starRating } from '@/lib/stats/starRating';
import { buildWinPercentageByPersonId } from '@/lib/stats/buildWinPercentageByPersonId';
import PlayerOfTheMonthCard from './PlayerOfTheMonthCard';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';
import type { RawMatch, RawTeam } from '@/lib/stats/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthDateRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const end = `${endYear}-${pad(endMonth)}-01`;
  return { start, end };
}

export default async function PlayerOfTheMonthPage() {
  const { supabase, organizer } = await requireOrganizer();

  await lockMissingPlayerOfTheMonthWinners(supabase, organizer.id);

  const { data: venues } = await supabase.from('venues').select('id, name').order('name');

  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  let lastMonthYear = currentYear;
  let lastMonth = currentMonth - 1;
  if (lastMonth === 0) {
    lastMonth = 12;
    lastMonthYear = currentYear - 1;
  }

  const { data: people } = await supabase
    .from('people')
    .select('id, name, nickname, photo_url')
    .eq('organizer_id', organizer.id);
  const personById = new Map((people ?? []).map((p) => [p.id, p]));

  // All-time win percentage per person, for winsVsHigherRated -- deliberately global
  // (not month-scoped), matching how the all-time Player Stats Card already judges
  // "was this opponent higher-rated" using each opponent's overall win rate, not just
  // their form within the same narrow window being displayed. buildWinPercentageByPersonId
  // does its own querying internally (organizer-scoped across every tournament) -- it
  // takes the organizer id and the list of person ids to compute for, not raw match data.
  const winPercentageByPersonId = await buildWinPercentageByPersonId(
    supabase,
    organizer.id,
    (people ?? []).map((p) => p.id)
  );

  // Fetches and reshapes one venue+month's tournaments/teams/matches into RawMatch[]/
  // RawTeam[] (the shape buildPersonMatchRecords and buildMonthlyCandidates need),
  // plus league-win credits via computeTournamentChampionPersonIds. Shared by both the
  // live race (every candidate) and the locked winner's postcard (one specific person).
  async function fetchMonthData(venueId: string, venueName: string, year: number, month: number) {
    const { start, end } = monthDateRange(year, month);
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, date, format, completed_at')
      .eq('venue_id', venueId)
      .eq('organizer_id', organizer.id)
      .gte('date', start)
      .lt('date', end);
    if (!tournaments || tournaments.length === 0) {
      return { matches: [] as RawMatch[], teams: [] as RawTeam[], leagueWinsByPersonId: new Map<string, number>() };
    }

    const tournamentIds = tournaments.map((t) => t.id);
    const tournamentDateById = new Map(tournaments.map((t) => [t.id, t.date]));

    const { data: teamsRaw } = await supabase
      .from('teams')
      .select('id, tournament_id, player_1_id, player_2_id')
      .in('tournament_id', tournamentIds);
    const { data: playersRaw } = await supabase
      .from('players')
      .select('id, tournament_id, person_id')
      .in('tournament_id', tournamentIds);
    const { data: matchesRaw } = await supabase
      .from('matches')
      .select('tournament_id, stage, team_a_id, team_b_id, score_a, score_b, status, round, court')
      .in('tournament_id', tournamentIds);

    const personIdByPlayerId = new Map((playersRaw ?? []).map((p) => [p.id, p.person_id as string | null]));

    const teams: RawTeam[] = (teamsRaw ?? [])
      .map((t) => ({
        id: t.id,
        tournamentId: t.tournament_id,
        player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
        player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
      }))
      .filter((t) => t.player1PersonId && t.player2PersonId);

    const matches: RawMatch[] = (matchesRaw ?? [])
      .filter((m) => m.team_b_id !== null && m.status === 'complete')
      .map((m) => ({
        tournamentId: m.tournament_id,
        tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
        venueName,
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id!,
        scoreA: m.score_a ?? 0,
        scoreB: m.score_b ?? 0,
        status: 'complete' as const,
      }));

    const leagueWinsByPersonId = new Map<string, number>();
    for (const tournament of tournaments) {
      const tournamentTeams = (teamsRaw ?? [])
        .filter((t) => t.tournament_id === tournament.id)
        .map((t) => {
          const p1 = personIdByPlayerId.get(t.player_1_id);
          const p2 = personIdByPlayerId.get(t.player_2_id);
          return p1 && p2 ? { id: t.id, person1Id: p1, person2Id: p2 } : null;
        })
        .filter((t): t is { id: string; person1Id: string; person2Id: string } => t !== null);
      const tournamentMatches = (matchesRaw ?? []).filter((m) => m.tournament_id === tournament.id);
      const championPersonIds = computeTournamentChampionPersonIds({
        format: tournament.format,
        completedAt: tournament.completed_at,
        matches: tournamentMatches,
        teams: tournamentTeams,
      });
      for (const personId of championPersonIds ?? []) {
        leagueWinsByPersonId.set(personId, (leagueWinsByPersonId.get(personId) ?? 0) + 1);
      }
    }

    return { matches, teams, leagueWinsByPersonId };
  }

  const venueSections = await Promise.all(
    (venues ?? []).map(async (venue) => {
      const { data: lastMonthRow } = await supabase
        .from('player_of_the_month')
        .select('person_id, match_wins, league_wins, win_percentage, matches_played')
        .eq('venue_id', venue.id)
        .eq('organizer_id', organizer.id)
        .eq('year', lastMonthYear)
        .eq('month', lastMonth)
        .maybeSingle();

      const winnerPerson = lastMonthRow?.person_id ? personById.get(lastMonthRow.person_id) : null;

      let winnerMatches: ReturnType<typeof buildPersonMatchRecords> = [];
      if (winnerPerson) {
        const { matches, teams } = await fetchMonthData(venue.id, venue.name, lastMonthYear, lastMonth);
        winnerMatches = buildPersonMatchRecords(winnerPerson.id, matches, teams).sort((a, b) =>
          a.tournamentDate < b.tournamentDate ? 1 : -1
        );
      }
      const winnerWins = lastMonthRow?.match_wins ?? 0;
      const winnerLosses = (lastMonthRow?.matches_played ?? 0) - winnerWins;
      const winnerRating =
        lastMonthRow?.win_percentage != null
          ? Math.round((lastMonthRow.win_percentage / 100) * 5 * 100) / 100
          : 0;

      const { matches: currentMatches, teams: currentTeams, leagueWinsByPersonId: currentLeagueWins } =
        await fetchMonthData(venue.id, venue.name, currentYear, currentMonth);
      const currentCandidates = buildMonthlyCandidates(currentMatches, currentTeams, currentLeagueWins);
      const race = rankMonthlyCandidates(currentCandidates).slice(0, 5);

      return { venue, lastMonthRow, winnerPerson, winnerMatches, winnerWins, winnerLosses, winnerRating, race };
    })
  );

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Player of the Month</h1>

      {venueSections.map(({ venue, lastMonthRow, winnerPerson, winnerMatches, winnerWins, winnerLosses, winnerRating, race }) => (
        <div key={venue.id} className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3">{venue.name}</h2>

          <div className={`${cardClass} mb-4`}>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
              🏆 Player of the Month
            </h3>
            {winnerPerson ? (
              <PlayerOfTheMonthCard
                monthLabel={`${MONTH_NAMES[lastMonth - 1].toUpperCase()} ${lastMonthYear}`}
                name={winnerPerson.nickname ? `${winnerPerson.name} (${winnerPerson.nickname})` : winnerPerson.name}
                photoUrl={winnerPerson.photo_url}
                playerNumber={null}
                ageHandednessLabel={null}
                rating={winnerRating}
                starCount={starRating(lastMonthRow?.win_percentage ?? 0)}
                formPercentage={lastMonthRow?.win_percentage ?? 0}
                threatPercentage={lastMonthRow?.win_percentage ?? 0}
                wins={winnerWins}
                losses={winnerLosses}
                winStreak={longestWinStreak(winnerMatches)}
                trendPoints={null}
                winsVsHigherRated={winsVsHigherRated(winnerMatches, lastMonthRow?.win_percentage ?? 0, winPercentageByPersonId)}
                totalMatches={lastMonthRow?.matches_played ?? 0}
                winsInLast10={winsInLastN(winnerMatches, 10)}
                signatureShots={[]}
              />
            ) : (
              <p className="text-sm text-slate-500">
                No Player of the Month for {MONTH_NAMES[lastMonth - 1]} {lastMonthYear}.
              </p>
            )}
          </div>

          <div className={cardClass}>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
              🏁 Race to Player of the Month — {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </h3>
            {race.length === 0 ? (
              <p className="text-sm text-slate-500">No qualifying players yet this month.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {race.map((entry, i) => {
                  const person = personById.get(entry.personId);
                  return (
                    <li key={entry.personId} className="flex items-center justify-between">
                      <Link
                        href={`/people/${entry.personId}`}
                        className="font-semibold text-navy-deep hover:underline"
                      >
                        {i + 1}. {person?.name ?? 'Unknown'}
                      </Link>
                      <span className="text-slate-500">
                        {entry.matchWins}W · {entry.leagueWins} league win{entry.leagueWins === 1 ? '' : 's'} ·{' '}
                        {entry.winPercentage}%
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      ))}
    </OrganizerShell>
  );
}
