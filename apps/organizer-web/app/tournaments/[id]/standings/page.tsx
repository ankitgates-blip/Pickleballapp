import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import {
  computeStandings,
  computeIndividualStandings,
  computeClaimTheThroneStandings,
} from '@/lib/tournament/standings';
import { isIndividualFormat as isIndividualFormatCheck } from '@/lib/tournament/formats';
import type { ClaimTheThroneRoundResult, MatchResult, Team } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass } from '@/app/components/ui';
import CopyLinkButton from './CopyLinkButton';

type LadderRoundResult = ClaimTheThroneRoundResult;

export default async function StandingsPage({
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

  const isClaimTheThrone = tournament?.format === 'claim_the_throne';
  const isUpAndDownRiver = tournament?.format === 'up_and_down_the_river';
  const isLadderFormat = isClaimTheThrone || isUpAndDownRiver;
  const isIndividualFormat = isIndividualFormatCheck(tournament?.format ?? '');

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
    .select('team_a_id, team_b_id, score_a, score_b, status, court')
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

  const teamsForIndividual: Team[] = (teams ?? []).map((t) => ({
    id: t.id,
    tournamentId: id,
    player1Id: t.player_1_id,
    player2Id: t.player_2_id,
  }));

  const standings = computeStandings(matchResults);
  const individualStandings = isIndividualFormat && !isLadderFormat
    ? computeIndividualStandings(matchResults, teamsForIndividual)
    : [];

  const teamById2 = new Map((teams ?? []).map((t) => [t.id, t]));
  const ladderMatches: LadderRoundResult[] = isLadderFormat
    ? (matches ?? [])
        .filter(
          (m): m is typeof m & { team_a_id: string; team_b_id: string; court: number; score_a: number; score_b: number } =>
            m.status === 'complete' &&
            m.team_a_id !== null &&
            m.team_b_id !== null &&
            m.court !== null &&
            m.score_a !== null &&
            m.score_b !== null
        )
        .map((m) => {
          const teamA = teamById2.get(m.team_a_id)!;
          const teamB = teamById2.get(m.team_b_id)!;
          return {
            court: m.court,
            teamAPlayerIds: [teamA.player_1_id, teamA.player_2_id] as [string, string],
            teamBPlayerIds: [teamB.player_1_id, teamB.player_2_id] as [string, string],
            scoreA: m.score_a,
            scoreB: m.score_b,
          };
        })
    : [];
  const numCourts = ladderMatches.length > 0
    ? Math.max(...ladderMatches.map((m) => m.court))
    : 0;
  const ladderStandings = isLadderFormat
    ? computeClaimTheThroneStandings(ladderMatches, numCourts)
    : [];

  const winPillClass =
    'inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-full bg-teal-100 text-teal-800 font-extrabold';
  const lossPillClass =
    'inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-full bg-slate-100 text-slate-500 font-extrabold';
  const rowClass = (rank: number) =>
    rank === 0
      ? 'border-b border-slate-100 last:border-0 bg-gradient-to-r from-amber-50 via-amber-50/50 to-transparent'
      : 'border-b border-slate-100 last:border-0';
  const diffClass = (diff: number) =>
    diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-slate-400';

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="standings" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Standings</h1>
        <CopyLinkButton tournamentId={id} />
      </div>

      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-semibold">{isIndividualFormat ? 'Player' : 'Team'}</th>
              {isLadderFormat && (
                <th className="pb-2 font-semibold text-center">Ladder Pts</th>
              )}
              <th className="pb-2 font-semibold text-center">W</th>
              <th className="pb-2 font-semibold text-center">L</th>
              <th className="pb-2 font-semibold text-center">
                {isLadderFormat ? 'Avg Diff' : 'Point Diff'}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLadderFormat
              ? ladderStandings.map((s, i) => {
                  const medal = ['🥇', '🥈', '🥉'][i];
                  const games = s.wins + s.losses;
                  const avgDiff = games > 0 ? (s.pointsFor - s.pointsAgainst) / games : 0;
                  return (
                    <tr key={s.playerId} className={rowClass(i)}>
                      <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                        {medal && <span className="mr-1.5">{medal}</span>}
                        {playerById.get(s.playerId)}
                      </td>
                      <td className="py-2 text-center text-teal-700 font-extrabold">{s.ladderPoints}</td>
                      <td className="py-2 text-center">
                        <span className={winPillClass}>{s.wins}</span>
                      </td>
                      <td className="py-2 text-center">
                        <span className={lossPillClass}>{s.losses}</span>
                      </td>
                      <td className={`py-2 text-center font-bold ${diffClass(avgDiff)}`}>
                        {avgDiff > 0 ? '+' : ''}
                        {avgDiff.toFixed(1)}
                      </td>
                    </tr>
                  );
                })
              : isIndividualFormat
                ? individualStandings.map((s, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i];
                    const diff = s.pointsFor - s.pointsAgainst;
                    return (
                      <tr key={s.playerId} className={rowClass(i)}>
                        <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                          {medal && <span className="mr-1.5">{medal}</span>}
                          {playerById.get(s.playerId)}
                        </td>
                        <td className="py-2 text-center">
                          <span className={winPillClass}>{s.wins}</span>
                        </td>
                        <td className="py-2 text-center">
                          <span className={lossPillClass}>{s.losses}</span>
                        </td>
                        <td className={`py-2 text-center font-bold ${diffClass(diff)}`}>
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </td>
                      </tr>
                    );
                  })
                : standings.map((s, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i];
                    const diff = s.pointsFor - s.pointsAgainst;
                    return (
                      <tr key={s.teamId} className={rowClass(i)}>
                        <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                          {medal && <span className="mr-1.5">{medal}</span>}
                          {teamById.get(s.teamId)}
                        </td>
                        <td className="py-2 text-center">
                          <span className={winPillClass}>{s.wins}</span>
                        </td>
                        <td className="py-2 text-center">
                          <span className={lossPillClass}>{s.losses}</span>
                        </td>
                        <td className={`py-2 text-center font-bold ${diffClass(diff)}`}>
                          {diff > 0 ? '+' : ''}
                          {diff}
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
