import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass } from '@/app/components/ui';
import { formatLabel, isIndividualFormat } from '@/lib/tournament/formats';
import { pairTeam, shuffleRemaining, removeTeam } from './actions';
import ThreatBadge from '@/app/components/ThreatBadge';
import { buildPersonMatchRecords } from '@/lib/stats/buildPersonMatchRecords';
import { winPercentageFromRecords } from '@/lib/stats/winRate';
import type { RawMatch, RawTeam } from '@/lib/stats/types';

const LEAGUE_PLAYOFFS_TEAM_CAP = 8;

export default async function TeamsPage({
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

  const isLeaguePlayoffs = tournament?.format === 'league_playoffs';
  const isAutoPaired = isIndividualFormat(tournament?.format ?? '');

  const { data: players } = await supabase
    .from('players')
    .select('id, name, person_id')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const { data: allTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('organizer_id', organizer.id);

  const allTournamentIds = (allTournaments ?? []).map((t) => t.id);

  const { data: allTeamsRaw } = allTournamentIds.length
    ? await supabase
        .from('teams')
        .select('id, player_1_id, player_2_id')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const { data: allPlayersRaw } = allTournamentIds.length
    ? await supabase
        .from('players')
        .select('id, person_id')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const { data: allMatchesRaw } = allTournamentIds.length
    ? await supabase
        .from('matches')
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const personIdByAllPlayerId = new Map(
    (allPlayersRaw ?? []).map((p) => [p.id, p.person_id as string | null])
  );

  // tournamentId/tournamentDate/venueName are unused by buildPersonMatchRecords for this
  // purpose (only `.won` is read off the resulting records), so they're left as placeholders.
  const allTeams: RawTeam[] = (allTeamsRaw ?? [])
    .map((t) => ({
      id: t.id,
      tournamentId: '',
      player1PersonId: personIdByAllPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByAllPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t) => t.player1PersonId && t.player2PersonId);

  const allCompleteMatches: RawMatch[] = (allMatchesRaw ?? [])
    .filter((m) => m.team_b_id !== null && m.status === 'complete')
    .map((m) => ({
      tournamentId: m.tournament_id,
      tournamentDate: '',
      venueName: '',
      teamAId: m.team_a_id!,
      teamBId: m.team_b_id!,
      scoreA: m.score_a ?? 0,
      scoreB: m.score_b ?? 0,
      status: 'complete' as const,
    }));

  const winPercentageByPersonId = new Map<string, number | null>();
  for (const p of players ?? []) {
    if (!p.person_id || winPercentageByPersonId.has(p.person_id)) continue;
    winPercentageByPersonId.set(
      p.person_id,
      winPercentageFromRecords(buildPersonMatchRecords(p.person_id, allCompleteMatches, allTeams))
    );
  }

  const { count: leagueMatchCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', id)
    .eq('stage', 'league');

  const hasLeagueMatches = (leagueMatchCount ?? 0) > 0;

  const teamCount = (teams ?? []).length;
  const atCap = isLeaguePlayoffs && teamCount >= LEAGUE_PLAYOFFS_TEAM_CAP;

  const pairedPlayerIds = new Set(
    (teams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id])
  );
  const unpairedPlayers = (players ?? []).filter((p) => !pairedPlayerIds.has(p.id));
  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));
  const personIdByPlayerId = new Map((players ?? []).map((p) => [p.id, p.person_id as string | null]));
  const winPercentageForPlayerId = (playerId: string): number | null => {
    const personId = personIdByPlayerId.get(playerId);
    return personId ? (winPercentageByPersonId.get(personId) ?? null) : null;
  };

  const pairTeamWithId = pairTeam.bind(null, id);
  const shuffleRemainingWithId = shuffleRemaining.bind(null, id);
  const selectClass =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 flex-1';

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="teams" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pair Teams</h1>
        {isLeaguePlayoffs && (
          <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
            {teamCount}/{LEAGUE_PLAYOFFS_TEAM_CAP} teams
          </span>
        )}
      </div>

      {isLeaguePlayoffs && hasLeagueMatches && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          This tournament already has a generated schedule. Removing a team also deletes its
          existing matches and their scores. After changing teams, head to Bracket and use
          Regenerate All Rounds to rebuild a clean schedule from the current team list.
        </div>
      )}

      {isAutoPaired ? (
        <div className="rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm px-4 py-3 mb-6">
          {formatLabel(tournament?.format ?? '')} auto-generates partners each round — head to
          Bracket to generate the schedule.
        </div>
      ) : atCap ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          8/8 teams — maximum reached for this format.
        </div>
      ) : (
        <>
          {unpairedPlayers.length >= 2 && (
            <div className={`${cardClass} mb-6 text-center`}>
              <p className="text-slate-600 mb-3">
                {unpairedPlayers.length} players unpaired. Shuffle them into random teams, or
                pair manually below.
              </p>
              <form action={shuffleRemainingWithId}>
                <button type="submit" className={accentButtonClass}>
                  Shuffle Remaining Players
                </button>
              </form>
            </div>
          )}

          <div className={`${cardClass} mb-6`}>
            <form action={pairTeamWithId} className="flex flex-col sm:flex-row gap-3">
              <select name="player1Id" required defaultValue="" className={selectClass}>
                <option value="" disabled>Player 1</option>
                {unpairedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select name="player2Id" required defaultValue="" className={selectClass}>
                <option value="" disabled>Player 2</option>
                {unpairedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button type="submit" className={primaryButtonClass}>
                Pair
              </button>
            </form>
          </div>
        </>
      )}

      <div className={`${cardClass} mb-6`}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Teams ({(teams ?? []).length})</h2>
        <ul className="space-y-2">
          {(teams ?? []).map((t) => {
            const removeTeamForTeam = removeTeam.bind(null, id, t.id);
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
              >
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="inline-flex items-center gap-1.5">
                    {playerById.get(t.player_1_id)}
                    <ThreatBadge winPercentage={winPercentageForPlayerId(t.player_1_id)} />
                  </span>
                  <span>/</span>
                  <span className="inline-flex items-center gap-1.5">
                    {playerById.get(t.player_2_id)}
                    <ThreatBadge winPercentage={winPercentageForPlayerId(t.player_2_id)} />
                  </span>
                </span>
                <form action={removeTeamForTeam}>
                  <button
                    type="submit"
                    className="text-xs font-semibold text-teal-700 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          Unpaired players ({unpairedPlayers.length})
        </h2>
        <ul className="flex flex-wrap gap-2">
          {unpairedPlayers.map((p) => (
            <li key={p.id} className={`${pillClass} bg-slate-100 text-slate-700 flex items-center gap-1.5`}>
              {p.name}
              <ThreatBadge winPercentage={winPercentageForPlayerId(p.id)} />
            </li>
          ))}
        </ul>
      </div>
    </OrganizerShell>
  );
}
