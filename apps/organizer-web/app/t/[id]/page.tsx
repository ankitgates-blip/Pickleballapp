import { createClient } from '@/lib/supabase/server';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';
import { cardClass } from '@/app/components/ui';

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
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Tournament not found.</p>
      </main>
    );
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-600 text-white">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <div className="mx-auto mb-2 h-3 w-3 rounded-full bg-amber-400" />
          <h1 className="text-2xl font-extrabold tracking-tight">{tournament.name}</h1>
          <p className="text-teal-100 text-sm mt-1">{tournament.date}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Standings</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-semibold">Team</th>
                <th className="pb-2 font-semibold text-center">W</th>
                <th className="pb-2 font-semibold text-center">L</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.teamId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-semibold text-slate-900">
                    {i === 0 && <span className="mr-1">🏆</span>}
                    {teamById.get(s.teamId)}
                  </td>
                  <td className="py-2 text-center text-teal-700 font-bold">{s.wins}</td>
                  <td className="py-2 text-center text-slate-500">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Schedule</h2>
          <ul className="space-y-2 text-sm">
            {(matches ?? []).map((m, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>
                  <span className="text-slate-400 mr-2">R{m.round}</span>
                  <span className="font-semibold">{teamById.get(m.team_a_id!)}</span>
                  <span className="text-slate-400 mx-1">vs</span>
                  <span className="font-semibold">
                    {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
                  </span>
                </span>
                {m.status === 'complete' && (
                  <span className="font-bold text-teal-700">
                    {m.score_a}-{m.score_b}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
