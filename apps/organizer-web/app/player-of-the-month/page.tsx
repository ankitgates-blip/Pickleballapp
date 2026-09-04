// apps/organizer-web/app/player-of-the-month/page.tsx
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { lockMissingPlayerOfTheMonthWinners } from './lockMissingWinners';
import { rankMonthlyCandidates, rankMonthlyCandidatesByPoints } from '@/lib/stats/playerOfTheMonth';
import { buildMonthlyCandidates } from '@/lib/stats/monthlyCandidates';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { compareMatchRecordsMostRecentFirst } from '@/lib/stats/personStats';
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import { longestWinStreak } from '@/lib/stats/winStreak';
import { winsInLastN } from '@/lib/stats/winsInLastN';
import { winsVsHigherRated } from '@/lib/stats/winsVsHigherRated';
import { starRating } from '@/lib/stats/starRating';
import { buildWinPercentageByPersonId } from '@/lib/stats/buildWinPercentageByPersonId';
import { computePointsLeaderboard, POINTS_SYSTEM_START_DATE, type PointsTournament } from '@/lib/stats/points';
import { assignRanksWithTies } from '@/lib/stats/rankWithTies';
import { monthDateRange } from '@/lib/stats/monthRange';
import PlayerOfTheMonthCard from './PlayerOfTheMonthCard';
import RaceLeaderboardCard from './RaceLeaderboardCard';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, headingClass, sectionKickerClass } from '@/app/components/ui';
import { SIGNATURE_SHOT_OPTIONS } from '@/lib/people/profileOptions';
import type { RawMatch, RawTeam } from '@/lib/stats/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

  // Pre-formatted server-side (pinned to UTC) and passed to RaceLeaderboardCard as a
  // plain string -- it's a client component that's also server-rendered on first
  // paint, so computing this inside it would risk the same server/client timezone
  // hydration mismatch fixed in ChampionCard/LocationLeaderboardCard.
  const generatedDateLabel = today.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const { data: people } = await supabase
    .from('people')
    .select('id, name, nickname, photo_url, signature_shot')
    .eq('organizer_id', organizer.id);
  const personById = new Map((people ?? []).map((p) => [p.id, p]));

  // Same emoji+skillName lookup the Player Stats Card on the profile page uses --
  // reused here so the postcard shown for the actual Player of the Month winner
  // carries the same signature-shot badges instead of always showing none.
  const signatureShotsForPerson = (signatureShot: string[] | null) =>
    (signatureShot ?? [])
      .map((v) => SIGNATURE_SHOT_OPTIONS.find((o) => o.value === v))
      .filter((b): b is (typeof SIGNATURE_SHOT_OPTIONS)[number] => Boolean(b))
      .map((b) => ({ emoji: b.emoji, skillName: b.skillName }));

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
    const { start, endExclusive: end } = monthDateRange(year, month);
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('id, date, format, completed_at')
      .eq('venue_id', venueId)
      .eq('organizer_id', organizer.id)
      .gte('date', start)
      .lt('date', end);
    if (!tournaments || tournaments.length === 0) {
      return {
        matches: [] as RawMatch[],
        teams: [] as RawTeam[],
        leagueWinsByPersonId: new Map<string, number>(),
        pointsTournaments: [] as PointsTournament[],
      };
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
        round: m.round,
        stage: m.stage,
        venueName,
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id!,
        scoreA: m.score_a ?? 0,
        scoreB: m.score_b ?? 0,
        status: 'complete' as const,
      }));

    const leagueWinsByPersonId = new Map<string, number>();
    const pointsTournaments: PointsTournament[] = [];
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

      pointsTournaments.push({
        id: tournament.id,
        date: tournament.date,
        format: tournament.format,
        completedAt: tournament.completed_at,
        matches: tournamentMatches,
        teams: tournamentTeams,
      });
    }

    return { matches, teams, leagueWinsByPersonId, pointsTournaments };
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
        winnerMatches = buildPersonMatchRecords(winnerPerson.id, matches, teams).sort(
          compareMatchRecordsMostRecentFirst
        );
      }
      const winnerWins = lastMonthRow?.match_wins ?? 0;
      const winnerLosses = (lastMonthRow?.matches_played ?? 0) - winnerWins;
      const winnerRating =
        lastMonthRow?.win_percentage != null
          ? Math.round((lastMonthRow.win_percentage / 100) * 5 * 100) / 100
          : 0;

      const {
        matches: currentMatches,
        teams: currentTeams,
        leagueWinsByPersonId: currentLeagueWins,
        pointsTournaments: currentPointsTournaments,
      } = await fetchMonthData(venue.id, venue.name, currentYear, currentMonth);
      // computePointsLeaderboard itself clamps to POINTS_SYSTEM_START_DATE, so this is
      // a no-op (empty leaderboard) if the current month is somehow before that.
      const currentPoints = computePointsLeaderboard({
        matches: currentMatches,
        teams: currentTeams,
        tournaments: currentPointsTournaments,
        range: monthDateRange(currentYear, currentMonth),
      });
      const currentTotalPointsByPersonId = new Map(currentPoints.map((e) => [e.personId, e.totalPoints]));
      const currentCandidates = buildMonthlyCandidates(
        currentMatches,
        currentTeams,
        currentLeagueWins,
        currentTotalPointsByPersonId
      );
      // Same September-2026 cutover as lockMissingPlayerOfTheMonthWinners -- the
      // points-weighted formula only makes sense once the points system is live.
      const isCurrentMonthPointsEra =
        `${currentYear}-${String(currentMonth).padStart(2, '0')}-01` >= POINTS_SYSTEM_START_DATE;
      const race = (
        isCurrentMonthPointsEra
          ? rankMonthlyCandidatesByPoints(currentCandidates)
          : rankMonthlyCandidates(currentCandidates)
      ).slice(0, 5);

      return { venue, lastMonthRow, winnerPerson, winnerMatches, winnerWins, winnerLosses, winnerRating, race };
    })
  );

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className={`text-2xl ${headingClass} mb-6`}>Player of the Month</h1>

      {venueSections.map(({ venue, lastMonthRow, winnerPerson, winnerMatches, winnerWins, winnerLosses, winnerRating, race }) => (
        <div key={venue.id} className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3">{venue.name}</h2>

          <div className={`${cardClass} mb-4`}>
            <h3 className={sectionKickerClass}>
              <span className="inline-block w-[3px] h-4 rounded-full bg-gold-bright" />
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
                signatureShots={signatureShotsForPerson(winnerPerson.signature_shot)}
              />
            ) : (
              <p className="text-sm text-slate-500">
                No Player of the Month for {MONTH_NAMES[lastMonth - 1]} {lastMonthYear}.
              </p>
            )}
          </div>

          <h3 className={sectionKickerClass}>
            <span className="inline-block w-[3px] h-4 rounded-full bg-gold-bright" />
            🏁 Race to Player of the Month — {MONTH_NAMES[currentMonth - 1]} {currentYear}
          </h3>
          <div className={race.length > 0 ? '' : cardClass}>
            {race.length === 0 ? (
              <p className="text-sm text-slate-500">No qualifying players yet this month.</p>
            ) : (
              <RaceLeaderboardCard
                venueName={venue.name}
                monthLabel={`${MONTH_NAMES[currentMonth - 1].toUpperCase()} ${currentYear}`}
                generatedDateLabel={generatedDateLabel}
                rows={assignRanksWithTies(
                  race.map((entry) => ({
                    name: personById.get(entry.personId)?.name ?? 'Unknown',
                    matchWins: entry.matchWins,
                    losses: entry.matchesPlayed - entry.matchWins,
                    leagueWins: entry.leagueWins,
                    // rankMonthlyCandidates (legacy, pre-September) has no real points
                    // concept -- 0 there is correct, not a fallback masking a bug,
                    // since the points system didn't exist yet for any month it
                    // still governs.
                    totalPoints: (entry as { totalPoints?: number }).totalPoints ?? 0,
                    overallWinPercentage: winPercentageByPersonId.get(entry.personId) ?? null,
                  })),
                  // Same tie criteria as the Locations Leaderboard: two people
                  // identical on match wins, losses, and league wins share a rank
                  // instead of an arbitrary 1st/2nd from array order -- deliberately
                  // NOT keyed on Total Points, so a small bonus-point difference (a
                  // shutout, a close loss) between two otherwise-identical records
                  // doesn't split them into different ranks.
                  (r) => `${r.matchWins}|${r.losses}|${r.leagueWins}`
                )}
              />
            )}
          </div>
        </div>
      ))}
    </OrganizerShell>
  );
}
