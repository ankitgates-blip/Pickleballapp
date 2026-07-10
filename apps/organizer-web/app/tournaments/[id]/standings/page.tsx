import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass } from '@/app/components/ui';
import CopyLinkButton from './CopyLinkButton';

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

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
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="standings" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Standings</h1>
        <CopyLinkButton tournamentId={id} />
      </div>

      <div className={`${cardClass} overflow-x-auto`}>
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
    </OrganizerShell>
  );
}
