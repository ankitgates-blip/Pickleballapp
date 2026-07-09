import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, inputClass, primaryButtonClass, pillClass, linkClass } from '@/app/components/ui';
import { enterScore } from './actions';

export default async function MatchesPage({
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
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="matches" />
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Enter Scores</h1>

      <div className="space-y-3">
        {(matches ?? [])
          .filter((m) => m.team_b_id !== null)
          .map((m) => {
            const enterScoreForMatch = enterScore.bind(null, id, m.id);
            const isComplete = m.status === 'complete';
            return (
              <div key={m.id} className={cardClass}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-slate-800">
                    Round {m.round}: {teamById.get(m.team_a_id!)}{' '}
                    <span className="text-slate-400">vs</span> {teamById.get(m.team_b_id!)}
                  </div>
                  <span
                    className={`${pillClass} ${
                      isComplete ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
                <form action={enterScoreForMatch} className="flex items-center gap-3">
                  <input
                    name="scoreA"
                    type="number"
                    defaultValue={m.score_a ?? ''}
                    placeholder="Team A"
                    required
                    className={`${inputClass} w-24`}
                  />
                  <span className="text-slate-400 font-bold">–</span>
                  <input
                    name="scoreB"
                    type="number"
                    defaultValue={m.score_b ?? ''}
                    placeholder="Team B"
                    required
                    className={`${inputClass} w-24`}
                  />
                  <button type="submit" className={primaryButtonClass}>
                    Save
                  </button>
                </form>
              </div>
            );
          })}
      </div>

      <p className="mt-6">
        <Link href={`/tournaments/${id}/standings`} className={linkClass}>
          View standings →
        </Link>
      </p>
    </OrganizerShell>
  );
}
