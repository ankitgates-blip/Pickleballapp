import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, headingClass } from '@/app/components/ui';
import EmptyState from '@/app/components/EmptyState';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { computeLocationLeaderboard } from '@/lib/stats/locationLeaderboard';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import type { RawMatch, RawTeam } from '@/lib/stats/types';
import { computePointsLeaderboard, type PointsTournament } from '@/lib/stats/points';
import { monthDateRange, monthToDateRange, monthsToCheck } from '@/lib/stats/monthRange';
import LocationLeaderboardCard from './LocationLeaderboardCard';
import Link from 'next/link';

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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

  // One shared period selector drives both the win/loss Leaderboard cards and the
  // Total Points list below -- month-to-date by default; ?month=YYYY-MM selects a
  // specific completed month. Unlike the old points-only version of this, month
  // options aren't clamped to when the points system began: real match/tournament
  // history exists before that, and this selector now also scopes the win/loss
  // ranking, which has always covered every format. computePointsLeaderboard still
  // does its own internal clamp to POINTS_SYSTEM_START_DATE, so picking a pre-launch
  // month just shows "No points yet this period" there while the win/loss cards
  // above show that month's real ranking. Anything unparseable or not yet a
  // completed month falls back to month-to-date silently rather than throwing.
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  const parsedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')
    ? { year: Number(month!.slice(0, 4)), month: Number(month!.slice(5, 7)) }
    : null;
  const isSelectableCompletedMonth =
    parsedMonth !== null &&
    (parsedMonth.year < currentYear ||
      (parsedMonth.year === currentYear && parsedMonth.month < currentMonth));
  const periodRange = isSelectableCompletedMonth
    ? monthDateRange(parsedMonth!.year, parsedMonth!.month)
    : monthToDateRange(today);
  const selectedMonthParam = isSelectableCompletedMonth ? month! : null;
  const periodLabel = isSelectableCompletedMonth
    ? `${MONTH_NAMES[parsedMonth!.month - 1].toUpperCase()} ${parsedMonth!.year}`
    : 'MONTH TO DATE';

  // Earliest tournament date this organizer has, through last month -- every
  // completed month with any real data, i.e. every month worth offering as a chip
  // alongside "Month to date". Falls back to no chips (just month-to-date) when
  // there's no tournament history yet.
  const earliestTournamentDate = (tournaments ?? []).reduce<string | null>(
    (min, t) => (min === null || t.date < min ? t.date : min),
    null
  );
  const [startYear, startMonthNum] = earliestTournamentDate
    ? earliestTournamentDate.slice(0, 7).split('-').map(Number)
    : [currentYear, currentMonth];
  const monthOptions = monthsToCheck(startYear, startMonthNum, currentYear, currentMonth);

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
    // Scoped to the selected period (month-to-date or a chosen past month) -- this is
    // what makes the win/loss Leaderboard reset each month instead of running as an
    // all-time aggregate: a tournament played outside the window simply isn't counted
    // toward this render's ranking, matches or league wins alike.
    const venueTournamentIds = new Set(
      (tournaments ?? [])
        .filter(
          (t) =>
            t.venue_id === venue.id &&
            t.date >= periodRange.start &&
            t.date < periodRange.endExclusive
        )
        .map((t) => t.id)
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

    const points = computePointsLeaderboard({
      matches: venueCompleteMatches,
      teams,
      tournaments: pointsTournaments,
      range: periodRange,
    });

    return {
      venueId: venue.id,
      venueName: venue.name,
      leaderboard: computeLocationLeaderboard(candidates),
      points,
    };
  });

  const leaderboardCardRowsByVenue = leaderboardsByVenue.map(({ venueId, venueName, leaderboard }) => ({
    venueId,
    venueName,
    rows: leaderboard.map((entry, i) => ({
      rank: i + 1,
      name: personNameById.get(entry.personId) ?? 'Unknown',
      venueWinPercentage: entry.winPercentage,
      overallWinPercentage: overallWinPercentageByPersonId.get(entry.personId) ?? null,
      matchesPlayed: entry.matchesPlayed,
      matchWins: entry.matchWins,
      losses: entry.losses,
      tournamentWins: entry.tournamentWins,
    })),
  }));

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className={`text-2xl ${headingClass} mb-3`}>Leaderboard</h1>

      {/* One shared period selector -- governs both the win/loss ranking cards below
          and the Total Points list further down, so there's a single answer to "which
          period am I looking at" for the whole page. Month-to-date is live and resets
          automatically at rollover; each past month stays browsable afterward as its
          own frozen ranking (e.g. "AUGUST 2026") rather than disappearing. */}
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
        {monthOptions.map(({ year, month: m }) => {
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

      {leaderboardCardRowsByVenue.map(({ venueId, venueName, rows }) =>
        rows.length > 0 ? (
          <div key={venueId} className="mb-6">
            <LocationLeaderboardCard
              venueName={venueName}
              periodLabel={periodLabel}
              generatedDateLabel={generatedDateLabel}
              rows={rows}
            />
          </div>
        ) : (
          <div key={venueId} className={`${cardClass} mb-6`}>
            <h2 className="text-lg font-bold text-slate-900 mb-3">{venueName}</h2>
            <EmptyState icon={<PaddleIcon />}>No matches played here yet {selectedMonthParam ? `in ${periodLabel.toLowerCase()}` : 'this month'}.</EmptyState>
          </div>
        )
      )}

      <div className={`${cardClass} mb-6`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">Total Points</h2>
        </div>
        <p className="text-xs text-muted mb-3">
          10 pts per match win · 5 pts for a loss reaching 10–10 · +25 for a league win
          (+10 more for an undefeated one) · +10 for league runner-up · +10 for an 11-0
          win · Custom League &amp; League + Playoffs only, starting September 2026
        </p>

        {leaderboardsByVenue.map(({ venueId, venueName, points }) => (
          <div key={venueId} className="mb-4 last:mb-0">
            <h3 className="text-sm font-bold text-slate-700 mb-2">{venueName}</h3>
            {points.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {points.map((entry, i) => {
                  const rank = i + 1;
                  // Same medal convention as LocationLeaderboardCard: gold gradient for
                  // 1st, flat silver/bronze for 2nd/3rd, an outlined circle with the rank
                  // number for everyone else -- so this list reads as the same kind of
                  // leaderboard as the card above it, not a plain numbered list.
                  const medalStyle =
                    rank === 1
                      ? { background: 'linear-gradient(135deg, #d6af36, #fde68a, #d6af36)' }
                      : rank === 2
                        ? { background: '#a7a7ad' }
                        : rank === 3
                          ? { background: '#a77044' }
                          : undefined;
                  return (
                    <li key={entry.personId} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0">
                      <Link
                        href={`/people/${entry.personId}`}
                        className={`flex items-center gap-2.5 font-semibold hover:underline ${rank === 1 ? 'text-navy-deep' : 'text-slate-800'}`}
                      >
                        <span
                          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold"
                          style={
                            medalStyle
                              ? { ...medalStyle, color: rank === 1 ? '#0c1830' : '#ffffff' }
                              : { border: '1.5px solid #cbd5e1', color: '#64748b' }
                          }
                        >
                          {rank}
                        </span>
                        {personNameById.get(entry.personId) ?? 'Unknown'}
                      </Link>
                      <span className="stat-num text-right">
                        <span className="font-extrabold text-navy-deep">{entry.totalPoints} pts</span>
                        <span className="block text-xs text-muted">
                          {entry.matchWins}×win
                          {entry.closeLosses > 0 ? ` · ${entry.closeLosses}×close loss` : ''}
                          {entry.leagueWins > 0 ? ` · ${entry.leagueWins}×league` : ''}
                          {entry.cleanSweepBonuses > 0 ? ` · ${entry.cleanSweepBonuses}×sweep` : ''}
                          {entry.leagueRunnerUps > 0 ? ` · ${entry.leagueRunnerUps}×runner-up` : ''}
                          {entry.shutoutWins > 0 ? ` · ${entry.shutoutWins}×11-0` : ''}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted">No points yet this period.</p>
            )}
          </div>
        ))}
      </div>
    </OrganizerShell>
  );
}
