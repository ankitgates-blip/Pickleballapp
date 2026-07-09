import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, pillClass } from '@/app/components/ui';
import { addPlayers } from './actions';

export default async function RosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const addPlayersWithId = addPlayers.bind(null, id);

  const nameCounts = new Map<string, number>();
  for (const p of players ?? []) {
    const key = p.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const duplicateNames = new Set(
    (players ?? [])
      .map((p) => p.name)
      .filter((name) => (nameCounts.get(name.trim().toLowerCase()) ?? 0) > 1)
  );

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="roster" />
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Roster</h1>

      <div className={`${cardClass} mb-6`}>
        <form action={addPlayersWithId} className="space-y-3">
          <textarea
            name="names"
            rows={8}
            placeholder="One player name per line"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
          <button type="submit" className={primaryButtonClass}>
            Add Players
          </button>
        </form>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          Players ({(players ?? []).length})
        </h2>
        {duplicateNames.size > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            ⚠ Duplicate name(s) — double-check pairing later:{' '}
            {Array.from(duplicateNames).join(', ')}
          </p>
        )}
        <ul className="flex flex-wrap gap-2">
          {(players ?? []).map((p) => (
            <li key={p.id} className={`${pillClass} bg-teal-50 text-teal-800`}>
              {p.name}
            </li>
          ))}
        </ul>
      </div>
    </OrganizerShell>
  );
}
