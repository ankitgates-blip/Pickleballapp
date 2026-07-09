import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, pillClass } from '@/app/components/ui';
import { pairTeam } from './actions';

export default async function TeamsPage({
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

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const pairedPlayerIds = new Set(
    (teams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id])
  );
  const unpairedPlayers = (players ?? []).filter((p) => !pairedPlayerIds.has(p.id));
  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));

  const pairTeamWithId = pairTeam.bind(null, id);
  const selectClass =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 flex-1';

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="teams" />
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Pair Teams</h1>

      <div className={`${cardClass} mb-6`}>
        <form action={pairTeamWithId} className="flex flex-col sm:flex-row gap-3">
          <select name="player1Id" required defaultValue="" className={selectClass}>
            <option value="" disabled>Player 1</option>
            {unpairedPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="player2Id" required defaultValue="" className={selectClass}>
            <option value="" disabled>Player 2</option>
            {unpairedPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit" className={primaryButtonClass}>
            Pair
          </button>
        </form>
      </div>

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Teams ({(teams ?? []).length})</h2>
        <ul className="space-y-2">
          {(teams ?? []).map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
            >
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {playerById.get(t.player_1_id)} / {playerById.get(t.player_2_id)}
            </li>
          ))}
        </ul>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          Unpaired players ({unpairedPlayers.length})
        </h2>
        <ul className="flex flex-wrap gap-2">
          {unpairedPlayers.map((p) => (
            <li key={p.id} className={`${pillClass} bg-slate-100 text-slate-700`}>
              {p.name}
            </li>
          ))}
        </ul>
      </div>
    </OrganizerShell>
  );
}
