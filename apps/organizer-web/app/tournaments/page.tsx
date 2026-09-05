// apps/organizer-web/app/tournaments/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import EmptyState from '@/app/components/EmptyState';
import { cardClass, primaryButtonClass } from '@/app/components/ui';

function CalendarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth={2} />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth={2} />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
import { timeslotLabel } from '@/lib/tournament/timeslots';
import { formatLabel } from '@/lib/tournament/formats';
import { computeTournamentChampionName, computeTournamentRunnerUpName } from '@/lib/tournament/champion';
import { cancelTournament } from './actions';
import TournamentCard from './TournamentCard';

const WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// ISO date -> "WED 03 SEP", UTC-parsed so the weekday/day-of-month can't shift
// with the viewer's own timezone (same convention as this app's other
// date-labeling code).
function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${WEEKDAY_ABBR[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR[d.getUTCMonth()]}`;
}

export default async function TournamentsPage() {
  const { supabase, organizer, role } = await requireOrganizer();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date, timeslot, completed_at, format, venues(name)')
    .eq('organizer_id', organizer.id)
    .order('date', { ascending: false });

  const tournamentIds = (tournaments ?? []).map((t) => t.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = (tournaments ?? [])
    .filter((t) => !t.completed_at)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const RECENTLY_COMPLETED_LIMIT = 10;
  const recentlyCompleted = (tournaments ?? [])
    .filter((t) => Boolean(t.completed_at))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, RECENTLY_COMPLETED_LIMIT);

  const completedTournamentIds = recentlyCompleted.map((t) => t.id);

  const [{ data: players }, { data: completedTeams }, { data: completedMatches }] =
    await Promise.all([
      tournamentIds.length
        ? supabase
            .from('players')
            .select('id, tournament_id, name')
            .in('tournament_id', tournamentIds)
        : { data: [] },
      completedTournamentIds.length
        ? supabase
            .from('teams')
            .select('id, tournament_id, player_1_id, player_2_id')
            .in('tournament_id', completedTournamentIds)
        : { data: [] },
      completedTournamentIds.length
        ? supabase
            .from('matches')
            .select('tournament_id, stage, team_a_id, team_b_id, score_a, score_b, status, round, court')
            .in('tournament_id', completedTournamentIds)
            .order('round', { ascending: true })
        : { data: [] },
    ]);

  const playerCountByTournament = new Map<string, number>();
  for (const p of players ?? []) {
    playerCountByTournament.set(
      p.tournament_id,
      (playerCountByTournament.get(p.tournament_id) ?? 0) + 1
    );
  }

  const playersByTournament = new Map<string, { id: string; name: string }[]>();
  for (const p of players ?? []) {
    const list = playersByTournament.get(p.tournament_id) ?? [];
    list.push({ id: p.id, name: p.name });
    playersByTournament.set(p.tournament_id, list);
  }

  const teamsByTournament = new Map<
    string,
    { id: string; player_1_id: string; player_2_id: string }[]
  >();
  for (const t of completedTeams ?? []) {
    const list = teamsByTournament.get(t.tournament_id) ?? [];
    list.push({ id: t.id, player_1_id: t.player_1_id, player_2_id: t.player_2_id });
    teamsByTournament.set(t.tournament_id, list);
  }

  const matchesByTournament = new Map<
    string,
    {
      stage: string;
      team_a_id: string | null;
      team_b_id: string | null;
      score_a: number | null;
      score_b: number | null;
      status: string;
      round: number;
      court: number | null;
    }[]
  >();
  for (const m of completedMatches ?? []) {
    const list = matchesByTournament.get(m.tournament_id) ?? [];
    list.push({
      stage: m.stage,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      score_a: m.score_a,
      score_b: m.score_b,
      status: m.status,
      round: m.round,
      court: m.court,
    });
    matchesByTournament.set(m.tournament_id, list);
  }

  const venueNameFor = (t: { venues: unknown }) => {
    const venue = t.venues as { name: string } | { name: string }[] | null;
    if (!venue) return 'Pickleturf';
    return Array.isArray(venue) ? (venue[0]?.name ?? 'Pickleturf') : venue.name;
  };

  const hasAnyList = upcoming.length > 0 || recentlyCompleted.length > 0;

  return (
    <OrganizerShell organizerName={organizer.name} role={role}>
      {(tournaments ?? []).length === 0 && (
        <div className={cardClass}>
          <EmptyState
            icon={<CalendarIcon />}
            cta={
              <Link href="/tournaments/new" className={primaryButtonClass}>
                + Create League
              </Link>
            }
          >
            No leagues yet — create your first one.
          </EmptyState>
        </div>
      )}

      {hasAnyList && (
        <div
          className="-mx-4 px-4 pt-6 pb-8 sm:mx-0 sm:rounded-2xl sm:px-6"
          style={{
            backgroundImage:
              'linear-gradient(180deg, #0c1830 0%, #0a1226 55%, #0c1830 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 32px)',
          }}
        >
          {upcoming.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-3 font-heading">Upcoming Matches</h2>
              <ul className="space-y-3">
                {upcoming.map((t) => {
                  const playerCount = playerCountByTournament.get(t.id) ?? 0;
                  const daysAway = Math.round(
                    (new Date(`${t.date}T00:00:00`).getTime() - today.getTime()) / 86400000
                  );
                  const status = daysAway < 0 ? 'overdue' : daysAway === 0 ? 'today' : 'upcoming';
                  const dateLabel =
                    status === 'today'
                      ? `${timeslotLabel(t.timeslot)}`
                      : status === 'overdue'
                        ? formatDateLabel(t.date)
                        : `IN ${daysAway} DAY${daysAway === 1 ? '' : 'S'} · ${formatDateLabel(t.date)}`;
                  return (
                    <li key={t.id}>
                      <TournamentCard
                        tournamentId={t.id}
                        status={status}
                        dateLabel={dateLabel}
                        format={formatLabel(t.format).toUpperCase()}
                        title={t.name}
                        venue={venueNameFor(t)}
                        playerCount={playerCount}
                        ctaHref={`/tournaments/${t.id}/roster`}
                        ctaLabel="Manage tournament"
                        cancelAction={cancelTournament.bind(null, t.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {recentlyCompleted.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-3 font-heading">Recently Completed</h2>
              <ul className="space-y-3">
                {recentlyCompleted.map((t) => {
                  const playerCount = playerCountByTournament.get(t.id) ?? 0;
                  const matches = matchesByTournament.get(t.id) ?? [];
                  const teams = teamsByTournament.get(t.id) ?? [];
                  const players = playersByTournament.get(t.id) ?? [];
                  const championName = computeTournamentChampionName({
                    format: t.format,
                    completedAt: t.completed_at,
                    matches,
                    teams,
                    players,
                  });
                  const runnerUpName = computeTournamentRunnerUpName({
                    format: t.format,
                    completedAt: t.completed_at,
                    matches,
                    teams,
                    players,
                  });
                  return (
                    <li key={t.id}>
                      <TournamentCard
                        tournamentId={t.id}
                        status="completed"
                        dateLabel={`${formatDateLabel(t.date)} · ${timeslotLabel(t.timeslot)}`}
                        format={formatLabel(t.format).toUpperCase()}
                        title={t.name}
                        champion={championName}
                        runnerUp={runnerUpName}
                        venue={venueNameFor(t)}
                        playerCount={playerCount}
                        matchesCount={matches.length}
                        ctaHref={`/tournaments/${t.id}/results`}
                        ctaLabel="View results"
                        cancelAction={cancelTournament.bind(null, t.id)}
                        isCompleted
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </OrganizerShell>
  );
}
