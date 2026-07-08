import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { addPlayers } from './actions';

export default async function RosterPage({
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
    <main style={{ maxWidth: 500, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Roster</h1>
      <form action={addPlayersWithId}>
        <textarea name="names" rows={8} placeholder="One player name per line" required />
        <button type="submit">Add Players</button>
      </form>

      <h2>Players ({(players ?? []).length})</h2>
      {duplicateNames.size > 0 && (
        <p style={{ color: 'darkorange' }}>
          Duplicate name(s) — double-check pairing later: {Array.from(duplicateNames).join(', ')}
        </p>
      )}
      <ul>
        {(players ?? []).map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>

      <Link href={`/tournaments/${id}/teams`}>Next: pair teams →</Link>
    </main>
  );
}
