import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, completed_at')
    .eq('id', id)
    .eq('organizer_id', organizer.id)
    .single();

  if (!tournament) {
    return (
      <OrganizerShell organizerName={organizer.name}>
        <p className="text-slate-500">Tournament not found.</p>
      </OrganizerShell>
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
    .select('id, round, team_a_id, team_b_id, score_a, score_b, status')
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
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-1">{tournament.name}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {tournament.date}
        {tournament.completed_at && (
          <> · Completed {new Date(tournament.completed_at).toLocaleDateString()}</>
        )}
      </p>

      <div className={`${cardClass} mb-6 overflow-x-auto`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Final Standings</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-semibold">Team</th>
              <th className="pb-2 font-semibold text-center">W</th>
              <th className="pb-2 font-semibold text-center">L</th>
              <th className="pb-2 font-semibold text-center">Point Diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const medal = ['🥇', '🥈', '🥉'][i];
              return (
                <tr key={s.teamId} className="border-b border-slate-100 last:border-0">
                  <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                    {medal && <span className="mr-1.5">{medal}</span>}
                    {teamById.get(s.teamId)}
                  </td>
                  <td className="py-2 text-center text-teal-700 font-extrabold">{s.wins}</td>
                  <td className="py-2 text-center text-slate-400 font-semibold">{s.losses}</td>
                  <td className="py-2 text-center font-bold">
                    {s.pointsFor - s.pointsAgainst > 0 ? '+' : ''}
                    {s.pointsFor - s.pointsAgainst}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">All Matches</h2>
        <ul className="space-y-2">
          {(matches ?? [])
            .filter((m) => m.team_b_id !== null)
            .map((m) => {
              const teamAName = teamById.get(m.team_a_id!) ?? 'Unknown';
              const teamBName = teamById.get(m.team_b_id!) ?? 'Unknown';
              const isComplete = m.status === 'complete';
              const teamAWon = isComplete && (m.score_a ?? 0) > (m.score_b ?? 0);
              const teamBWon = isComplete && (m.score_b ?? 0) > (m.score_a ?? 0);

              return (
                <li key={m.id} className="text-sm border-b border-slate-100 last:border-0 pb-2">
                  <div className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">
                    Round {m.round}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={teamAWon ? 'font-extrabold text-slate-900' : 'font-medium text-slate-600'}>
                      {teamAWon && <span className="mr-1">🏆</span>}
                      {teamAName}
                    </span>
                    <span className="text-slate-400 text-xs">vs</span>
                    <span className={teamBWon ? 'font-extrabold text-slate-900' : 'font-medium text-slate-600'}>
                      {teamBWon && <span className="mr-1">🏆</span>}
                      {teamBName}
                    </span>
                  </div>
                  {isComplete ? (
                    <div className="text-center font-bold text-teal-700 mt-1">
                      {m.score_a}-{m.score_b}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 text-xs mt-1">Not yet played</div>
                  )}
                </li>
              );
            })}
        </ul>
      </div>
    </OrganizerShell>
  );
}
