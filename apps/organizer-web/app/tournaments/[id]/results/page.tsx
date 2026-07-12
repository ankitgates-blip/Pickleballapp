// apps/organizer-web/app/tournaments/[id]/results/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { computeStandings, computeIndividualStandings } from '@/lib/tournament/standings';
import { formatLabel, isIndividualFormat as isIndividualFormatCheck } from '@/lib/tournament/formats';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import type { MatchResult, Team } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import { cardClass } from '@/app/components/ui';

const STAGE_LABELS: Record<string, string> = {
  league: 'League',
  semifinal: 'Semifinal',
  final: 'Final',
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, date, format, timeslot, completed_at, venues(name)')
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

  const venue = tournament.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : (venue?.name ?? 'Pickle Turf');

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
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const leagueMatches = (matches ?? []).filter((m) => m.stage === 'league');
  const finalMatches = (matches ?? []).filter((m) => m.stage === 'final');

  const leagueMatchResults: MatchResult[] = leagueMatches.map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(leagueMatchResults);

  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
  const isIndividualFormat = isIndividualFormatCheck(tournament.format);

  const teamsForIndividual: Team[] = (teams ?? []).map((t) => ({
    id: t.id,
    tournamentId: id,
    player1Id: t.player_1_id,
    player2Id: t.player_2_id,
  }));
  const individualStandings = isIndividualFormat
    ? computeIndividualStandings(leagueMatchResults, teamsForIndividual)
    : [];

  const finalMatch = finalMatches[0];
  const championTeamId = !isIndividualFormat && tournament.completed_at
    ? finalMatch
      ? (finalMatch.score_a ?? 0) > (finalMatch.score_b ?? 0)
        ? finalMatch.team_a_id
        : finalMatch.team_b_id
      : standings[0]?.teamId
    : undefined;
  const championPlayerId =
    isIndividualFormat && tournament.completed_at ? individualStandings[0]?.playerId : undefined;

  const renderMatch = (m: NonNullable<typeof matches>[number]) => {
    const teamAName = teamById.get(m.team_a_id!) ?? 'Unknown';
    const teamBName = teamById.get(m.team_b_id!) ?? 'Unknown';
    const isComplete = m.status === 'complete';
    const teamAWon = isComplete && (m.score_a ?? 0) > (m.score_b ?? 0);
    const teamBWon = isComplete && (m.score_b ?? 0) > (m.score_a ?? 0);

    return (
      <li key={m.id} className="text-sm border-b border-slate-100 last:border-0 pb-2">
        {m.stage === 'league' && (
          <div className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">
            Round {m.round}
          </div>
        )}
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
  };

  return (
    <OrganizerShell organizerName={organizer.name}>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-1">{tournament.name}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {tournament.date} · 📍 {venueName} · 🕐 {timeslotLabel(tournament.timeslot)} · {formatLabel(tournament.format)}
        {tournament.completed_at && (
          <> · Completed {new Date(tournament.completed_at).toLocaleDateString()}</>
        )}
      </p>

      {(championTeamId || championPlayerId) && (
        <div
          className={`${cardClass} mb-6 text-center bg-gradient-to-br from-amber-50 to-lime-50 border-amber-200`}
        >
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">Champion</div>
          <div className="text-xl font-extrabold text-slate-900">
            {championPlayerId ? playerById.get(championPlayerId) : teamById.get(championTeamId!)}
          </div>
        </div>
      )}

      <div className={`${cardClass} mb-6`}>
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

      <div className={`${cardClass} mb-6 overflow-x-auto`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          {isIndividualFormat
            ? 'Individual Standings'
            : isLeaguePlayoffs
              ? 'League Standings'
              : 'Final Standings'}
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-semibold">{isIndividualFormat ? 'Player' : 'Team'}</th>
              <th className="pb-2 font-semibold text-center">W</th>
              <th className="pb-2 font-semibold text-center">L</th>
              <th className="pb-2 font-semibold text-center">Point Diff</th>
            </tr>
          </thead>
          <tbody>
            {isIndividualFormat
              ? individualStandings.map((s, i) => {
                  const medal = ['🥇', '🥈', '🥉'][i];
                  return (
                    <tr key={s.playerId} className="border-b border-slate-100 last:border-0">
                      <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                        {medal && <span className="mr-1.5">{medal}</span>}
                        {playerById.get(s.playerId)}
                      </td>
                      <td className="py-2 text-center text-teal-700 font-extrabold">{s.wins}</td>
                      <td className="py-2 text-center text-slate-400 font-semibold">{s.losses}</td>
                      <td className="py-2 text-center font-bold">
                        {s.pointsFor - s.pointsAgainst > 0 ? '+' : ''}
                        {s.pointsFor - s.pointsAgainst}
                      </td>
                    </tr>
                  );
                })
              : standings.map((s, i) => {
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

      {isLeaguePlayoffs ? (
        (['league', 'semifinal', 'final'] as const).map((stage) => {
          const stageMatches = (matches ?? []).filter(
            (m) => m.stage === stage && m.team_b_id !== null
          );
          if (stageMatches.length === 0) return null;
          return (
            <div key={stage} className={`${cardClass} mb-6`}>
              <h2 className="text-lg font-bold text-slate-900 mb-3">{STAGE_LABELS[stage]}</h2>
              <ul className="space-y-2">{stageMatches.map(renderMatch)}</ul>
            </div>
          );
        })
      ) : (
        <div className={cardClass}>
          <h2 className="text-lg font-bold text-slate-900 mb-3">All Matches</h2>
          <ul className="space-y-2">
            {(matches ?? []).filter((m) => m.team_b_id !== null).map(renderMatch)}
          </ul>
        </div>
      )}
    </OrganizerShell>
  );
}
