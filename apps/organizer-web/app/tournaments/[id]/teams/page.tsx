import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, primaryButtonClass, accentButtonClass, pillClass } from '@/app/components/ui';
import { formatLabel, isIndividualFormat } from '@/lib/tournament/formats';
import { pairTeam, shuffleRemaining, removeTeam } from './actions';

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
  const isPopcorn = tournament?.format === 'popcorn';
  const isGauntlet = tournament?.format === 'gauntlet';
  const isAutoPaired = isIndividualFormat(tournament?.format ?? '');

  const { data: players } = await supabase
    .from('players')
    .select('id, name')
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', id);

  const teamCount = (teams ?? []).length;
  const atCap = isLeaguePlayoffs && teamCount >= LEAGUE_PLAYOFFS_TEAM_CAP;

  const pairedPlayerIds = new Set(
    (teams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id])
  );
  const unpairedPlayers = (players ?? []).filter((p) => !pairedPlayerIds.has(p.id));
  const playerById = new Map((players ?? []).map((p) => [p.id, p.name]));

  const pairTeamWithId = pairTeam.bind(null, id);
  const shuffleRemainingWithId = shuffleRemaining.bind(null, id);
  const selectClass =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 flex-1';

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="teams" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Pair Teams</h1>
        {isLeaguePlayoffs && (
          <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
            {teamCount}/{LEAGUE_PLAYOFFS_TEAM_CAP} teams
          </span>
        )}
      </div>

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
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {playerById.get(t.player_1_id)} / {playerById.get(t.player_2_id)}
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
            <li key={p.id} className={`${pillClass} bg-slate-100 text-slate-700`}>
              {p.name}
            </li>
          ))}
        </ul>
      </div>
    </OrganizerShell>
  );
}
