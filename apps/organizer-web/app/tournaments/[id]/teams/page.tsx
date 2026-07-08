import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { pairTeam } from './actions';

export default async function TeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireOrganizer();

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

  return (
    <main style={{ maxWidth: 500, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Pair Teams</h1>

      <form action={pairTeamWithId}>
        <select name="player1Id" required defaultValue="">
          <option value="" disabled>Player 1</option>
          {unpairedPlayers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="player2Id" required defaultValue="">
          <option value="" disabled>Player 2</option>
          {unpairedPlayers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button type="submit">Pair</button>
      </form>

      <h2>Teams ({(teams ?? []).length})</h2>
      <ul>
        {(teams ?? []).map((t) => (
          <li key={t.id}>
            {playerById.get(t.player_1_id)} / {playerById.get(t.player_2_id)}
          </li>
        ))}
      </ul>

      <h2>Unpaired players ({unpairedPlayers.length})</h2>
      <ul>
        {unpairedPlayers.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>

      <Link href={`/tournaments/${id}/bracket`}>Next: generate bracket →</Link>
    </main>
  );
}
