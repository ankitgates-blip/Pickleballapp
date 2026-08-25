// apps/organizer-web/app/tournaments/[id]/results/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import {
  computeStandings,
  computeIndividualStandings,
  computeClaimTheThroneStandings,
} from '@/lib/tournament/standings';
import { formatLabel, usesIndividualStandings, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import { computeTournamentChampionName } from '@/lib/tournament/champion';
import {
  buildTeamStandingsRows,
  buildIndividualStandingsRows,
  buildLadderStandingsRows,
  buildMatchGroups,
} from '@/lib/tournament/resultsExport';
import type { ClaimTheThroneRoundResult, MatchResult, Team } from '@/lib/types';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass } from '@/app/components/ui';
import ShareResultsButton from './ShareResultsButton';

type LadderRoundResult = ClaimTheThroneRoundResult;

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
        <p className="text-slate-500">League not found.</p>
      </OrganizerShell>
    );
  }

  const venue = tournament.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickleturf') : (venue?.name ?? 'Pickleturf');

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
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status, court')
    .eq('tournament_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true });

  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const teamById = new Map(
    (teams ?? []).map((t) => [
      t.id,
      `${playerById.get(t.player_1_id)} / ${playerById.get(t.player_2_id)}`,
    ])
  );

  const leagueMatches = (matches ?? []).filter((m) => m.stage === 'league');

  const leagueMatchResults: MatchResult[] = leagueMatches.map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(leagueMatchResults);

  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
  const isLadderFormat = isLadderFormatCheck(tournament.format);
  const isIndividualFormat = usesIndividualStandings(tournament.format);

  const teamsForIndividual: Team[] = (teams ?? []).map((t) => ({
    id: t.id,
    tournamentId: id,
    player1Id: t.player_1_id,
    player2Id: t.player_2_id,
  }));
  const individualStandings = isIndividualFormat && !isLadderFormat
    ? computeIndividualStandings(leagueMatchResults, teamsForIndividual)
    : [];

  const teamById2 = new Map((teams ?? []).map((t) => [t.id, t]));
  const ladderMatches: LadderRoundResult[] = isLadderFormat
    ? leagueMatches
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

  const championName = computeTournamentChampionName({
    format: tournament.format,
    completedAt: tournament.completed_at,
    matches: (matches ?? []).map((m) => ({
      stage: m.stage,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      score_a: m.score_a,
      score_b: m.score_b,
      status: m.status,
      round: m.round,
      court: m.court,
    })),
    teams: (teams ?? []).map((t) => ({
      id: t.id,
      player_1_id: t.player_1_id,
      player_2_id: t.player_2_id,
    })),
    players: (players ?? []).map((p) => ({ id: p.id, name: p.name })),
  });

  const standingsTitle = isLadderFormat
    ? 'Ladder Standings'
    : isIndividualFormat
      ? 'Individual Standings'
      : isLeaguePlayoffs
        ? 'League Standings'
        : 'Final Standings';

  const exportStandingsRows = isLadderFormat
    ? buildLadderStandingsRows(ladderStandings, playerById)
    : isIndividualFormat
      ? buildIndividualStandingsRows(individualStandings, playerById)
      : buildTeamStandingsRows(standings, teamById);

  const exportMatchGroups = buildMatchGroups(
    (matches ?? []).map((m) => ({
      round: m.round,
      stage: m.stage,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      score_a: m.score_a,
      score_b: m.score_b,
      status: m.status,
    })),
    teamById,
    isLeaguePlayoffs
  );

  const renderMatch = (m: NonNullable<typeof matches>[number]) => {
    const teamAName = teamById.get(m.team_a_id!) ?? 'Unknown';
    const teamBName = teamById.get(m.team_b_id!) ?? 'Unknown';
    const isComplete = m.status === 'complete';
    const isSkipped = m.status === 'skipped';
    const teamAWon = isComplete && (m.score_a ?? 0) > (m.score_b ?? 0);
    const teamBWon = isComplete && (m.score_b ?? 0) > (m.score_a ?? 0);

    return (
      <li key={m.id} className="text-sm border-b border-slate-100 last:border-0 pb-2">
        {m.stage === 'league' && (
          <div className="text-xs font-semibold text-navy-mid uppercase tracking-wide mb-1">
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
          <div className="text-center font-bold text-navy-mid mt-1">
            {m.score_a}-{m.score_b}
          </div>
        ) : (
          <div className="text-center text-slate-400 text-xs mt-1">
            {isSkipped ? 'Skipped' : 'Not yet played'}
          </div>
        )}
      </li>
    );
  };

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="results" />
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{tournament.name}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {tournament.date} · 📍 {venueName} · 🕐 {timeslotLabel(tournament.timeslot)} · {formatLabel(tournament.format)}
        {tournament.completed_at && (
          <> · Completed {new Date(tournament.completed_at).toLocaleDateString()}</>
        )}
      </p>

      <div className="mb-6">
        <ShareResultsButton
          tournamentName={tournament.name}
          date={tournament.date}
          venueName={venueName}
          timeslotLabel={timeslotLabel(tournament.timeslot)}
          formatLabel={formatLabel(tournament.format)}
          completedAt={tournament.completed_at}
          championName={championName}
          standingsTitle={standingsTitle}
          standingsRows={exportStandingsRows}
          matchGroups={exportMatchGroups}
        />
        <p className="text-xs text-slate-400 mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      {championName && (
        <div
          className={`${cardClass} mb-6 text-center bg-gradient-to-br from-amber-50 to-lime-50 border-amber-200`}
        >
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">Champion</div>
          <div className="text-xl font-extrabold text-slate-900">{championName}</div>
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
                  className="block rounded-lg bg-navy-tint px-3 py-2 text-sm font-semibold text-navy-deep hover:bg-navy-mid/10 transition-colors"
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
        <h2 className="text-lg font-bold text-slate-900 mb-3">{standingsTitle}</h2>
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
                    <tr key={s.playerId} className="border-b border-slate-100 last:border-0">
                      <td className={`py-2 ${i === 0 ? 'font-extrabold text-base' : 'font-semibold'} text-slate-900`}>
                        {medal && <span className="mr-1.5">{medal}</span>}
                        {playerById.get(s.playerId)}
                      </td>
                      <td className="py-2 text-center text-navy-mid font-extrabold">{s.ladderPoints}</td>
                      <td className="py-2 text-center text-navy-mid font-extrabold">{s.wins}</td>
                      <td className="py-2 text-center text-slate-400 font-semibold">{s.losses}</td>
                      <td className="py-2 text-center font-bold">
                        {avgDiff >= 0 ? '+' : ''}
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
                        <td className="py-2 text-center text-navy-mid font-extrabold">{s.wins}</td>
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
                        <td className="py-2 text-center text-navy-mid font-extrabold">{s.wins}</td>
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
