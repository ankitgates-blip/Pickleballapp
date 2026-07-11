// apps/organizer-web/app/t/[id]/page.tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { computeStandings } from '@/lib/tournament/standings';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import type { MatchResult } from '@/lib/types';
import { cardClass } from '@/app/components/ui';

const STAGE_LABELS: Record<string, string> = {
  league: 'League',
  semifinal: 'Semifinal',
  final: 'Final',
};

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, timeslot, venues(name)')
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
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: matches } = await supabase
    .from('matches')
    .select('round, stage, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const venue = tournament.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : (venue?.name ?? 'Pickle Turf');

  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
  const leagueMatches = (matches ?? []).filter((m) => m.stage === 'league');

  const matchResults: MatchResult[] = leagueMatches.map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);
  const stages: Array<'league' | 'semifinal' | 'final'> = ['league', 'semifinal', 'final'];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-teal-600 to-cyan-600 text-white">
        <div
          aria-hidden
          className="ball-texture absolute -top-8 -right-6 h-32 w-32 rounded-full opacity-90"
          style={{ background: 'radial-gradient(circle at 35% 35%, #eaff00, #c9e800)' }}
        />
        <div className="relative max-w-2xl mx-auto px-4 py-6 text-center">
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-xl shadow-md -rotate-6">
            🏓
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{tournament.name}</h1>
          <p className="text-teal-50 text-sm mt-1 font-medium">
            {tournament.date} · 📍 {venueName} · 🕐 {timeslotLabel(tournament.timeslot)}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            Players ({(players ?? []).length})
          </h2>
          <ul className="space-y-2">
            {(players ?? []).map((p) =>
              p.person_id ? (
                <li key={p.id}>
                  <Link
                    href={`/p/${p.person_id}`}
                    className="block rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 transition-colors"
                  >
                    {p.name}
                  </Link>
                </li>
              ) : (
                <li
                  key={p.id}
                  className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600"
                >
                  {p.name}
                </li>
              )
            )}
          </ul>
        </div>

        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            {isLeaguePlayoffs ? 'League Standings' : 'Standings'}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-semibold">Team</th>
                <th className="pb-2 font-semibold text-center">W</th>
                <th className="pb-2 font-semibold text-center">L</th>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {stages.map((stage) => {
          const stageMatches = (matches ?? []).filter((m) => m.stage === stage);
          if (stageMatches.length === 0) return null;

          return (
            <div key={stage} className={cardClass}>
              <h2 className="text-lg font-bold text-slate-900 mb-3">
                {isLeaguePlayoffs ? STAGE_LABELS[stage] : 'Schedule'}
              </h2>
              <ul className="space-y-2 text-sm">
                {stageMatches.map((m, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>
                      {stage === 'league' && (
                        <span className="text-slate-400 mr-2">R{m.round}</span>
                      )}
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
          );
        })}
      </main>
    </div>
  );
}
