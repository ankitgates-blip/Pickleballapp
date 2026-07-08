import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';
import CopyLinkButton from './CopyLinkButton';

export default async function StandingsPage({
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

  const { data: matches } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id);

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
      <h1>Standings</h1>
      <CopyLinkButton tournamentId={id} />
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>W</th>
            <th>L</th>
            <th>Point Diff</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.teamId}>
              <td>{teamById.get(s.teamId)}</td>
              <td>{s.wins}</td>
              <td>{s.losses}</td>
              <td>{s.pointsFor - s.pointsAgainst}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
