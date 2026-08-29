import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, headingClass } from '@/app/components/ui';
import EmptyState from '@/app/components/EmptyState';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computeLocationLeaderboard } from '@/lib/stats/locationLeaderboard';
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import type { RawMatch, RawTeam } from '@/lib/stats/types';
import { computePointsLeaderboard, POINTS_SYSTEM_START_DATE, type PointsTournament } from '@/lib/stats/points';
import { monthDateRange, monthToDateRange, monthsToCheck } from '@/lib/stats/monthRange';
import LocationLeaderboardCard from './LocationLeaderboardCard';
import Link from 'next/link';

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function PaddleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="9" rx="6" ry="7" stroke="currentColor" strokeWidth={2} />
      <path d="M12 16v6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M9 22h6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
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

  // Points system: month-to-date by default; ?month=YYYY-MM selects a specific
  // completed month from September 2026 onward. Anything unparseable, before the
  // points system started, or not yet a completed month falls back to month-to-date
  // silently rather than throwing.
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  const parsedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')
    ? { year: Number(month!.slice(0, 4)), month: Number(month!.slice(5, 7)) }
    : null;
  const isSelectableCompletedMonth =
    parsedMonth !== null &&
    `${month}-01` >= POINTS_SYSTEM_START_DATE &&
    (parsedMonth.year < currentYear ||
      (parsedMonth.year === currentYear && parsedMonth.month < currentMonth));
  const pointsRange = isSelectableCompletedMonth
    ? monthDateRange(parsedMonth!.year, parsedMonth!.month)
    : monthToDateRange(today);
  const selectedMonthParam = isSelectableCompletedMonth ? month! : null;
  const periodLabel = isSelectableCompletedMonth
    ? `${MONTH_ABBR[parsedMonth!.month - 1]} ${parsedMonth!.year}`
    : 'Month to Date';

  // September 2026 through last month — every completed month the points system has
  // been live for, i.e. every month worth offering as a chip alongside "Month to date".
  const [startYear, startMonthNum] = POINTS_SYSTEM_START_DATE.split('-').map(Number);
  const pointsMonthOptions = monthsToCheck(startYear, startMonthNum, currentYear, currentMonth);

  // Pre-formatted server-side (pinned to UTC) and passed to the leaderboard card as a
  // plain string -- the card is a client component that's also server-rendered on
  // first paint, so computing this inside it would risk the same server/client
  // timezone hydration mismatch fixed in ChampionCard.
  const generatedDateLabel = today.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

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

    // Also used for the tournamentWinsByPersonId champion-credit loop below.
    const tournamentWinsByPersonId = new Map<string, number>();
    const pointsTournaments: PointsTournament[] = [];
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

      pointsTournaments.push({
        id: tournamentId,
        date: tournament.date,
        format: tournament.format,
        completedAt: tournament.completed_at,
        matches: tournamentMatches,
        teams: tournamentTeams,
      });
    }

    const points = computePointsLeaderboard({
      matches: venueCompleteMatches,
      teams,
      tournaments: pointsTournaments,
      range: pointsRange,
    });

    // The points system has no data at all before September 2026 (or, later, for a
    // quiet period with zero completed matches) -- computePointsLeaderboard returns
    // an empty array by design in both cases. Rather than the leaderboard just
    // vanishing while everyone waits for a real points period to exist, fall back to
    // the all-time match-record ranking this page always showed before the points
    // merge. The Points column reads 0 in that case, which is accurate: none have
    // been awarded yet.
    const allTimeCandidates = (people ?? [])
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
    const allTimeLeaderboard = computeLocationLeaderboard(allTimeCandidates);

    return {
      venueId: venue.id,
      venueName: venue.name,
      points,
      allTimeLeaderboard,
    };
  });

  const leaderboardCardRowsByVenue = leaderboardsByVenue.map(
    ({ venueId, venueName, points, allTimeLeaderboard }) => {
      const usingPoints = points.length > 0;
      return {
        venueId,
        venueName,
        periodLabel: usingPoints ? periodLabel : 'All-Time',
        rows: usingPoints
          ? points.map((entry, i) => ({
              rank: i + 1,
              name: personNameById.get(entry.personId) ?? 'Unknown',
              matchesPlayed: entry.matchesPlayed,
              matchWins: entry.matchWins,
              winPercentage:
                entry.matchesPlayed > 0 ? (entry.matchWins / entry.matchesPlayed) * 100 : null,
              leagueWins: entry.leagueWins,
              totalPoints: entry.totalPoints,
            }))
          : allTimeLeaderboard.map((entry, i) => ({
              rank: i + 1,
              name: personNameById.get(entry.personId) ?? 'Unknown',
              matchesPlayed: entry.matchesPlayed,
              matchWins: entry.matchWins,
              winPercentage: entry.winPercentage,
              leagueWins: entry.tournamentWins,
              totalPoints: 0,
            })),
      };
    }
  );

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className={`text-2xl ${headingClass} mb-6`}>Location Stats</h1>

      <p className="text-xs text-muted mb-2">
        10 pts per match win · 25 bonus pts per league win · starts September 2026
      </p>
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/locations"
          className={`stat-num inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
            selectedMonthParam === null
              ? 'bg-navy-deep text-white'
              : 'bg-navy-tint text-navy-deep hover:bg-navy-mid/20'
          }`}
        >
          Month to date
        </Link>
        {pointsMonthOptions.map(({ year, month: m }) => {
          const value = `${year}-${String(m).padStart(2, '0')}`;
          return (
            <Link
              key={value}
              href={`/locations?month=${value}`}
              className={`stat-num inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                selectedMonthParam === value
                  ? 'bg-navy-deep text-white'
                  : 'bg-navy-tint text-navy-deep hover:bg-navy-mid/20'
              }`}
            >
              {MONTH_ABBR[m - 1]} {year}
            </Link>
          );
        })}
      </div>

      {leaderboardCardRowsByVenue.map(({ venueId, venueName, periodLabel: cardPeriodLabel, rows }) =>
        rows.length > 0 ? (
          <div key={venueId} className="mb-6">
            <LocationLeaderboardCard
              venueName={venueName}
              periodLabel={cardPeriodLabel}
              generatedDateLabel={generatedDateLabel}
              rows={rows}
            />
          </div>
        ) : (
          <div key={venueId} className={`${cardClass} mb-6`}>
            <h2 className="text-lg font-bold text-slate-900 mb-3">{venueName}</h2>
            <EmptyState icon={<PaddleIcon />}>No matches played here yet.</EmptyState>
          </div>
        )
      )}
    </OrganizerShell>
  );
}
