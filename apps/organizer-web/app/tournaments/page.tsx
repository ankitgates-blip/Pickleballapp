// apps/organizer-web/app/tournaments/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, vibrantCardClass } from '@/app/components/ui';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import { formatLabel } from '@/lib/tournament/formats';
import { cancelTournament } from './actions';
import CancelTournamentButton from './CancelTournamentButton';

export default async function TournamentsPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date, timeslot, completed_at, format, venues(name)')
    .eq('organizer_id', organizer.id)
    .order('date', { ascending: false });

  const tournamentIds = (tournaments ?? []).map((t) => t.id);

  const { data: players } = tournamentIds.length
    ? await supabase.from('players').select('tournament_id').in('tournament_id', tournamentIds)
    : { data: [] };

  const playerCountByTournament = new Map<string, number>();
  for (const p of players ?? []) {
    playerCountByTournament.set(
      p.tournament_id,
      (playerCountByTournament.get(p.tournament_id) ?? 0) + 1
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = (tournaments ?? [])
    .filter((t) => !t.completed_at)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const recentlyCompleted = (tournaments ?? [])
    .filter((t) => Boolean(t.completed_at))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const venueNameFor = (t: { venues: unknown }) => {
    const venue = t.venues as { name: string } | { name: string }[] | null;
    if (!venue) return 'Pickle Turf';
    return Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : venue.name;
  };

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Tournaments</h1>

      {(tournaments ?? []).length === 0 && (
        <div className={`${cardClass} text-center text-slate-500`}>
          No tournaments yet — create your first one.
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-extrabold text-slate-900 mb-3 flex items-center gap-2">
            <span>🔥</span> Upcoming Matches
          </h2>
          <ul className="space-y-3">
            {upcoming.map((t) => {
              const playerCount = playerCountByTournament.get(t.id) ?? 0;
              const daysAway = Math.round(
                (new Date(`${t.date}T00:00:00`).getTime() - today.getTime()) / 86400000
              );
              const isOverdue = daysAway < 0;
              return (
                <li key={t.id}>
                  <div className={vibrantCardClass}>
                    <span
                      className={`absolute top-0 right-0 ${
                        isOverdue ? 'bg-red-600' : 'bg-orange-500'
                      } text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide`}
                    >
                      {isOverdue
                        ? 'OVERDUE'
                        : daysAway === 0
                          ? 'TODAY'
                          : `${daysAway} DAY${daysAway === 1 ? '' : 'S'}`}
                    </span>
                    <div className="font-extrabold text-base text-slate-900 mb-1.5">
                      🏆 {t.name}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                      <span>📍 {venueNameFor(t)}</span>
                      <span>🕐 {timeslotLabel(t.timeslot)}</span>
                      <span>👥 {playerCount} player{playerCount === 1 ? '' : 's'}</span>
                      <span>📅 {t.date}</span>
                      <span>🎯 {formatLabel(t.format)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <Link
                        href={`/tournaments/${t.id}/roster`}
                        className="text-xs font-bold text-teal-700 hover:underline"
                      >
                        Manage tournament →
                      </Link>
                      <CancelTournamentButton
                        tournamentName={t.name}
                        cancelAction={cancelTournament.bind(null, t.id)}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {recentlyCompleted.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-extrabold text-slate-900 mb-3 flex items-center gap-2">
            <span>✅</span> Recently Completed
          </h2>
          <ul className="space-y-3">
            {recentlyCompleted.map((t) => {
              const playerCount = playerCountByTournament.get(t.id) ?? 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/tournaments/${t.id}/results`}
                    className={`${cardClass} block hover:border-teal-400 transition-colors`}
                  >
                    <div className="font-extrabold text-base text-slate-900 mb-1.5">
                      🏆 {t.name}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                      <span>📍 {venueNameFor(t)}</span>
                      <span>🕐 {timeslotLabel(t.timeslot)}</span>
                      <span>👥 {playerCount} player{playerCount === 1 ? '' : 's'}</span>
                      <span>📅 {t.date}</span>
                      <span>🎯 {formatLabel(t.format)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </OrganizerShell>
  );
}
