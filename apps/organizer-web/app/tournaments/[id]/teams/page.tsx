import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass } from '@/app/components/ui';
import { formatLabel, isIndividualFormat } from '@/lib/tournament/formats';
import { pairTeam, shuffleRemaining, removeTeam } from './actions';
import ThreatBadge from '@/app/components/ThreatBadge';
import PersonAvatar from '@/app/components/PersonAvatar';
import SaveButton from '@/app/components/SaveButton';
import { buildWinPercentageByPersonId } from '@/lib/stats/buildWinPercentageByPersonId';

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

  const winPercentageByPersonId = await buildWinPercentageByPersonId(
    supabase,
    organizer.id,
    (players ?? []).map((p) => p.person_id)
  );

  const { data: allPeople } = await supabase
    .from('people')
    .select('id, photo_url')
    .eq('organizer_id', organizer.id);
  const photoUrlByPersonId = new Map((allPeople ?? []).map((p) => [p.id, p.photo_url as string | null]));

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
  const photoUrlForPlayerId = (playerId: string): string | null => {
    const personId = personIdByPlayerId.get(playerId);
    return personId ? (photoUrlByPersonId.get(personId) ?? null) : null;
  };

  const pairTeamWithId = pairTeam.bind(null, id);
  const shuffleRemainingWithId = shuffleRemaining.bind(null, id);
  const selectClass =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-mid focus:border-navy-mid flex-1';

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="teams" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pair Teams</h1>
        {isLeaguePlayoffs && (
          <span className="text-sm font-semibold text-navy-mid bg-navy-tint rounded-full px-3 py-1">
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
        <div className="rounded-lg bg-navy-tint border border-navy-mid/25 text-navy-deep text-sm px-4 py-3 mb-6">
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
                <SaveButton className={accentButtonClass} pendingLabel="Shuffling…">
                  Shuffle Remaining Players
                </SaveButton>
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
              <SaveButton className={primaryButtonClass} pendingLabel="Pairing…">
                Pair
              </SaveButton>
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
                className="flex items-center justify-between gap-2 rounded-lg bg-navy-tint px-3 py-2 text-sm font-semibold text-navy-deep"
              >
                <span className="flex items-center gap-2.5 flex-wrap">
                  <span className="flex -space-x-2 flex-shrink-0">
                    <PersonAvatar photoUrl={photoUrlForPlayerId(t.player_1_id)} name={playerById.get(t.player_1_id) ?? '?'} size={28} />
                    <PersonAvatar photoUrl={photoUrlForPlayerId(t.player_2_id)} name={playerById.get(t.player_2_id) ?? '?'} size={28} />
                  </span>
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
                  <SaveButton
                    className="text-xs font-semibold text-navy-mid hover:text-red-600 transition-colors disabled:opacity-50"
                    pendingLabel="Removing…"
                  >
                    Remove
                  </SaveButton>
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
            <li key={p.id} className={`${pillClass} bg-slate-100 text-slate-700 gap-1.5`}>
              {p.name}
              <ThreatBadge winPercentage={winPercentageForPlayerId(p.id)} />
            </li>
          ))}
        </ul>
      </div>
    </OrganizerShell>
  );
}
