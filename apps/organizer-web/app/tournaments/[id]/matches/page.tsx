import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { enterScore } from './actions';

export default async function MatchesPage({
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
    .select('id, round, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Enter Scores</h1>
      {(matches ?? [])
        .filter((m) => m.team_b_id !== null)
        .map((m) => {
          const enterScoreForMatch = enterScore.bind(null, id, m.id);
          return (
            <div key={m.id} style={{ marginBottom: '1rem' }}>
              <div>
                Round {m.round}: {teamById.get(m.team_a_id!)} vs{' '}
                {teamById.get(m.team_b_id!)} — {m.status}
              </div>
              <form action={enterScoreForMatch}>
                <input
                  name="scoreA"
                  type="number"
                  defaultValue={m.score_a ?? ''}
                  placeholder="Team A score"
                  required
                />
                <input
                  name="scoreB"
                  type="number"
                  defaultValue={m.score_b ?? ''}
                  placeholder="Team B score"
                  required
                />
                <button type="submit">Save</button>
              </form>
            </div>
          );
        })}
      <Link href={`/tournaments/${id}/standings`}>View standings →</Link>
    </main>
  );
}
