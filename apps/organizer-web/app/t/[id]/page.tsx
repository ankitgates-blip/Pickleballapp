import { createClient } from '@/lib/supabase/server';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date')
    .eq('id', id)
    .single();

  if (!tournament) {
    return <main style={{ maxWidth: 600, margin: '2rem auto' }}>Tournament not found.</main>;
  }

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id);

  const { data: matches } = await supabase
    .from('matches')
    .select('round, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const matchResults: MatchResult[] = (matches ?? []).map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{tournament.name}</h1>
      <p>{tournament.date}</p>

      <h2>Standings</h2>
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>W</th>
            <th>L</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.teamId}>
              <td>{teamById.get(s.teamId)}</td>
              <td>{s.wins}</td>
              <td>{s.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Schedule</h2>
      {(matches ?? []).map((m, i) => (
        <div key={i}>
          Round {m.round}: {teamById.get(m.team_a_id!)} vs{' '}
          {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
          {m.status === 'complete' ? ` — ${m.score_a}-${m.score_b}` : ''}
        </div>
      ))}
    </main>
  );
}
