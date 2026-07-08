import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { generateBracket } from './actions';

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireOrganizer();

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id);

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const { data: matches } = await supabase
    .from('matches')
    .select('id, round, team_a_id, team_b_id')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const generateBracketWithId = generateBracket.bind(null, id);
  const hasMatches = Boolean(matches && matches.length > 0);
  const teamCount = (teams ?? []).length;

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Bracket</h1>

      {!hasMatches && teamCount < 2 && (
        <p style={{ color: 'red' }}>
          Need at least 2 teams to generate a bracket — you have {teamCount}. Go back and
          pair more teams first.
        </p>
      )}

      {!hasMatches && teamCount >= 2 && (
        <form action={generateBracketWithId}>
          <button type="submit">Generate Round Robin Bracket</button>
        </form>
      )}

      {(matches ?? []).map((m) => (
        <div key={m.id}>
          Round {m.round}: {teamById.get(m.team_a_id!) ?? 'Bye'} vs{' '}
          {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
        </div>
      ))}

      {hasMatches && (
        <p>
          <Link href={`/tournaments/${id}/matches`}>Enter scores →</Link>
          {' | '}
          <Link href={`/tournaments/${id}/standings`}>View standings →</Link>
        </p>
      )}
    </main>
  );
}
