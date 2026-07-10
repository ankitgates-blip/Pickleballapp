import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, accentButtonClass, linkClass } from '@/app/components/ui';
import { formatLabel } from '@/lib/tournament/formats';
import { generateBracket } from './actions';

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', id)
    .single();

  const format = tournament?.format ?? 'round_robin';

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

  type MatchRow = NonNullable<typeof matches>[number];
  const rounds = new Map<number, MatchRow[]>();
  for (const m of matches ?? []) {
    const list = rounds.get(m.round) ?? [];
    list.push(m);
    rounds.set(m.round, list);
  }

  const isRoundRobin = format === 'round_robin';

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="bracket" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Bracket</h1>
        <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
          {formatLabel(format)}
        </span>
      </div>

      {!isRoundRobin && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          {formatLabel(format)} isn't available yet — bracket generation for this format is
          coming soon. Round Robin is the only format that works today.
        </div>
      )}

      {isRoundRobin && !hasMatches && teamCount < 2 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 2 teams to generate a bracket — you have {teamCount}. Go back and
          pair more teams first.
        </div>
      )}

      {isRoundRobin && !hasMatches && teamCount >= 2 && (
        <form action={generateBracketWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate a round-robin schedule.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round Robin Bracket
          </button>
        </form>
      )}

      <div className="space-y-4">
        {Array.from(rounds.entries()).map(([round, roundMatches]) => (
          <div key={round} className={cardClass}>
            <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">
              Round {round}
            </h2>
            <ul className="space-y-2">
              {roundMatches.map((m) => (
                <li key={m.id} className="text-sm text-slate-800 flex items-center gap-2">
                  <span className="font-semibold">{teamById.get(m.team_a_id!) ?? 'Bye'}</span>
                  <span className="text-slate-400">vs</span>
                  <span className="font-semibold">
                    {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {hasMatches && (
        <p className="mt-6 flex gap-4">
          <Link href={`/tournaments/${id}/matches`} className={linkClass}>
            Enter scores →
          </Link>
          <Link href={`/tournaments/${id}/standings`} className={linkClass}>
            View standings →
          </Link>
        </p>
      )}
    </OrganizerShell>
  );
}
