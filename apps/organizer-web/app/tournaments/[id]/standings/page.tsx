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
  const individualStandings = isIndividualFormat && !isClaimTheThrone
    ? computeIndividualStandings(matchResults, teamsForIndividual)
    : [];

  const teamById2 = new Map((teams ?? []).map((t) => [t.id, t]));
  const claimTheThroneMatches: ClaimTheThroneRoundResult[] = isClaimTheThrone
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
  const numCourts = claimTheThroneMatches.length > 0
    ? Math.max(...claimTheThroneMatches.map((m) => m.court))
    : 0;
  const claimTheThroneStandings = isClaimTheThrone
    ? computeClaimTheThroneStandings(claimTheThroneMatches, numCourts)
    : [];

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
              <th className="pb-2 font-semibold">{isIndividualFormat ? 'Player' : 'Team'}</th>
              {isClaimTheThrone && (
                <th className="pb-2 font-semibold text-center">Ladder Pts</th>
              )}
              <th className="pb-2 font-semibold text-center">W</th>
              <th className="pb-2 font-semibold text-center">L</th>
              <th className="pb-2 font-semibold text-center">
                {isClaimTheThrone ? 'Avg Diff' : 'Point Diff'}
              </th>
            </tr>
          </thead>
          <tbody>
            {isClaimTheThrone
              ? claimTheThroneStandings.map((s, i) => {
                  const medal = ['🥇', '🥈', '🥉'][i];
                  const games = s.wins + s.losses;
                  const avgDiff = games > 0 ? (s.pointsFor - s.pointsAgainst) / games : 0;
                  return (
                    <tr key={s.playerId} className="border-b border-slate-100 last:border-0">
                      <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                        {medal && <span className="mr-1.5">{medal}</span>}
                        {playerById.get(s.playerId)}
                      </td>
                      <td className="py-2 text-center text-teal-700 font-extrabold">{s.ladderPoints}</td>
                      <td className="py-2 text-center text-teal-700 font-extrabold">{s.wins}</td>
                      <td className="py-2 text-center text-slate-400 font-semibold">{s.losses}</td>
                      <td className="py-2 text-center font-bold">
                        {avgDiff > 0 ? '+' : ''}
                        {avgDiff.toFixed(1)}
                      </td>
                    </tr>
                  );
                })
              : isIndividualFormat
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
    </OrganizerShell>
  );
}
