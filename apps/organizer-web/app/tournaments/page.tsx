import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass, vibrantCardClass, accentButtonClass } from '@/app/components/ui';

export default async function TournamentsPage() {
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, date, completed_at, venues(name)')
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
  const in14Days = new Date(today);
  in14Days.setDate(in14Days.getDate() + 14);

  const upcoming = (tournaments ?? [])
    .filter((t) => {
      const d = new Date(`${t.date}T00:00:00`);
      return d >= today && d <= in14Days;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentlyCompleted = (tournaments ?? [])
    .filter((t) => t.completed_at && new Date(t.completed_at) >= sevenDaysAgo)
    .sort((a, b) => (a.completed_at! < b.completed_at! ? 1 : -1));

  const venueNameFor = (t: { venues: unknown }) => {
    const venue = t.venues as { name: string } | { name: string }[] | null;
    if (!venue) return 'Pickle Turf';
    return Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : venue.name;
  };

  return (
    <OrganizerShell organizerName={organizer.name}>
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
              return (
                <li key={t.id} className={vibrantCardClass}>
                  <span className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide">
                    {daysAway === 0 ? 'TODAY' : `${daysAway} DAY${daysAway === 1 ? '' : 'S'}`}
                  </span>
                  <div className="font-extrabold text-base text-slate-900 mb-1.5">
                    🏆 {t.name}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                    <span>📍 {venueNameFor(t)}</span>
                    <span>👥 {playerCount} player{playerCount === 1 ? '' : 's'}</span>
                    <span>📅 {t.date}</span>
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
                      <span>👥 {playerCount} player{playerCount === 1 ? '' : 's'}</span>
                      <span>📅 {t.date}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Your Tournaments</h1>
        <Link href="/tournaments/new" className={accentButtonClass}>
          + New Tournament
        </Link>
      </div>

      {(tournaments ?? []).length === 0 && (
        <div className={`${cardClass} text-center text-slate-500`}>
          No tournaments yet — create your first one.
        </div>
      )}

      <ul className="space-y-3">
        {(tournaments ?? []).map((t) => (
          <li key={t.id}>
            <Link
              href={`/tournaments/${t.id}/roster`}
              className={`${cardClass} flex items-center justify-between hover:border-teal-400 transition-colors block`}
            >
              <span className="font-semibold text-slate-900">{t.name}</span>
              <span className="text-sm text-slate-500">{t.date}</span>
            </Link>
          </li>
        ))}
      </ul>
    </OrganizerShell>
  );
}
