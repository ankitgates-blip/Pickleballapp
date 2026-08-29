// apps/organizer-web/app/tournaments/[id]/bracket/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, actionCardClass, accentButtonClass, linkClass, inputClass, primaryButtonClass, outlineButtonClass, headingClass } from '@/app/components/ui';
import { formatLabel, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
import { courtLabel } from '@/lib/tournament/courts';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import { computeStandings } from '@/lib/tournament/standings';
import { customFullCoverageRounds } from '@/lib/tournament/customAuto';
import { MAX_LEAGUE_PLAYOFFS_ROUND_CYCLES } from '@/lib/tournament/roundRobin';
import { canEditScore, canEditTeams } from '@/lib/tournament/completion';
import { buildMatchGroups } from '@/lib/tournament/resultsExport';
import type { MatchResult } from '@/lib/types';
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, generateLeaguePlayoffsBracket, regenerateLeaguePlayoffsBracket, generateSemifinalMatches, generateFinalMatch, skipToFinalMatch, updateMatchTeams, addCustomMatch, autoGenerateCustomRound, removeCustomMatch, unlockTournamentResults, lockTournamentResults } from './actions';
import { enterScore, skipMatch } from '../matches/actions';
import ShareScheduleButton from './ShareScheduleButton';
import RegenerateLeagueRoundsButton from './RegenerateLeagueRoundsButton';
import SaveButton from '@/app/components/SaveButton';

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select(
      'name, date, timeslot, format, popcorn_rounds, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, custom_rounds, completed_at, results_unlocked_at, venues(name)'
    )
    .eq('id', id)
    .single();

  const format = tournament?.format ?? 'round_robin';
  const isRoundRobin = format === 'round_robin';
  const isLeaguePlayoffs = format === 'league_playoffs';
  const isDoubleHeader = format === 'double_header';
  const isPopcorn = format === 'popcorn';
  const isGauntlet = format === 'gauntlet';
  const isClaimTheThrone = format === 'claim_the_throne';
  const isUpAndDownRiver = format === 'up_and_down_the_river';
  const isLadderFormat = isLadderFormatCheck(format);
  const isCustom = format === 'custom';
  const customTargetRounds = tournament?.custom_rounds ?? 5;
  const isSupported =
    isRoundRobin ||
    isLeaguePlayoffs ||
    isDoubleHeader ||
    isPopcorn ||
    isGauntlet ||
    isClaimTheThrone ||
    isUpAndDownRiver ||
    isCustom;

  const venue = tournament?.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickleturf') : (venue?.name ?? 'Pickleturf');

  const { data: teams } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id, is_ad_hoc')
    .eq('tournament_id', id);

  const fixedTeams = (teams ?? []).filter((t) => !t.is_ad_hoc);

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
  const teamPlayerIdsById = new Map(
    (teams ?? []).map((t) => [t.id, [t.player_1_id, t.player_2_id] as [string, string]])
  );

  const { data: matches } = await supabase
    .from('matches')
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status, court')
    .eq('tournament_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true });

  // Custom League has no playoff stage by default, but can generate one (from its
  // fixed teams) the same way League + Playoffs always does -- once it has, its
  // matches should split into League/Semifinal/Final sections the same way too.
  const hasPlayoffStages = (matches ?? []).some(
    (m) => m.stage === 'semifinal' || m.stage === 'final'
  );
  const splitByStage = isLeaguePlayoffs || hasPlayoffStages;

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
    splitByStage
  );

  const teamCount = (teams ?? []).length;
  const playerCount = (players ?? []).length;
  const customFixedTeamCount = fixedTeams.length;
  const fixedPairedPlayerIds = new Set(fixedTeams.flatMap((t) => [t.player_1_id, t.player_2_id]));
  const isDynamicMode = (players ?? []).some((p) => !fixedPairedPlayerIds.has(p.id));

  const leagueMatches = (matches ?? []).filter((m) => m.stage === 'league');
  const semifinalMatches = (matches ?? []).filter((m) => m.stage === 'semifinal');
  const finalMatches = (matches ?? []).filter((m) => m.stage === 'final');

  const hasLeagueMatches = leagueMatches.length > 0;
  const realLeagueMatches = leagueMatches.filter((m) => m.team_b_id !== null);
  const allLeagueComplete =
    realLeagueMatches.length > 0 && realLeagueMatches.every((m) => m.status === 'complete');
  const allSemifinalComplete =
    semifinalMatches.length === 2 && semifinalMatches.every((m) => m.status === 'complete');
  const hasFinalMatch = finalMatches.length > 0;

  const currentCustomMaxRound =
    isCustom && leagueMatches.length > 0
      ? Math.max(...leagueMatches.map((m) => m.round))
      : 0;
  const customFullCoverageRoundsValue = isCustom ? customFullCoverageRounds(customFixedTeamCount) : 0;

  const generateBracketWithId = generateBracket.bind(null, id);
  const generatePopcornBracketWithId = generatePopcornBracket.bind(null, id);
  const advanceGauntletRoundWithId = advanceGauntletRound.bind(null, id);
  const advanceClaimTheThroneRoundWithId = advanceClaimTheThroneRound.bind(null, id);
  const advanceUpAndDownRiverRoundWithId = advanceUpAndDownRiverRound.bind(null, id);
  const generateLeaguePlayoffsBracketWithId = generateLeaguePlayoffsBracket.bind(null, id);
  const regenerateLeaguePlayoffsBracketWithId = regenerateLeaguePlayoffsBracket.bind(null, id);
  const generateSemifinalMatchesWithId = generateSemifinalMatches.bind(null, id);
  const generateFinalMatchWithId = generateFinalMatch.bind(null, id);
  const skipToFinalMatchWithId = skipToFinalMatch.bind(null, id);
  const addCustomMatchWithId = addCustomMatch.bind(null, id);
  const autoGenerateCustomRoundWithId = autoGenerateCustomRound.bind(null, id);
  const unlockTournamentResultsWithId = unlockTournamentResults.bind(null, id);
  const lockTournamentResultsWithId = lockTournamentResults.bind(null, id);

  const canEditScoreValue = canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null);
  const canEditTeamsValue = canEditTeams(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null);

  const gauntletRounds = tournament?.gauntlet_rounds ?? 5;
  const currentGauntletRound =
    leagueMatches.length > 0 ? Math.max(...leagueMatches.map((m) => m.round)) : 0;
  const currentGauntletRoundMatches = leagueMatches.filter(
    (m) => m.round === currentGauntletRound
  );
  const currentGauntletRoundComplete =
    currentGauntletRoundMatches.length > 0 &&
    currentGauntletRoundMatches.every((m) => m.status === 'complete');
  const showGenerateNextGauntletRound =
    isGauntlet && hasLeagueMatches && currentGauntletRoundComplete && currentGauntletRound < gauntletRounds;
  const showSkipGauntletRound =
    isGauntlet && hasLeagueMatches && !currentGauntletRoundComplete && currentGauntletRound < gauntletRounds;

  const claimTheThroneRounds = tournament?.claim_the_throne_rounds ?? 5;
  const currentClaimTheThroneRound =
    leagueMatches.length > 0 ? Math.max(...leagueMatches.map((m) => m.round)) : 0;
  const currentClaimTheThroneRoundMatches = leagueMatches.filter(
    (m) => m.round === currentClaimTheThroneRound
  );
  const currentClaimTheThroneRoundComplete =
    currentClaimTheThroneRoundMatches.length > 0 &&
    currentClaimTheThroneRoundMatches.every((m) => m.status === 'complete');
  const showGenerateNextClaimTheThroneRound =
    isClaimTheThrone &&
    hasLeagueMatches &&
    currentClaimTheThroneRoundComplete &&
    currentClaimTheThroneRound < claimTheThroneRounds;
  const showSkipClaimTheThroneRound =
    isClaimTheThrone &&
    hasLeagueMatches &&
    !currentClaimTheThroneRoundComplete &&
    currentClaimTheThroneRound < claimTheThroneRounds;
  const claimTheThronePlayerCountValid = playerCount > 0 && playerCount % 4 === 0;

  const upAndDownRiverRounds = tournament?.up_and_down_the_river_rounds ?? 5;
  const currentUpAndDownRiverRound =
    leagueMatches.length > 0 ? Math.max(...leagueMatches.map((m) => m.round)) : 0;
  const currentUpAndDownRiverRoundMatches = leagueMatches.filter(
    (m) => m.round === currentUpAndDownRiverRound
  );
  const currentUpAndDownRiverRoundComplete =
    currentUpAndDownRiverRoundMatches.length > 0 &&
    currentUpAndDownRiverRoundMatches.every((m) => m.status === 'complete');
  const showGenerateNextUpAndDownRiverRound =
    isUpAndDownRiver &&
    hasLeagueMatches &&
    currentUpAndDownRiverRoundComplete &&
    currentUpAndDownRiverRound < upAndDownRiverRounds;
  const showSkipUpAndDownRiverRound =
    isUpAndDownRiver &&
    hasLeagueMatches &&
    !currentUpAndDownRiverRoundComplete &&
    currentUpAndDownRiverRound < upAndDownRiverRounds;
  const upAndDownRiverPlayerCountValid = playerCount > 0 && playerCount % 4 === 0;

  const leaguePlayoffsFullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  const leaguePlayoffsRounds = tournament?.league_playoffs_rounds ?? leaguePlayoffsFullRounds;
  const playoffsStarted = semifinalMatches.length > 0 || finalMatches.length > 0;
  const hasScoredLeagueMatches = leagueMatches.some((m) => m.status === 'complete');
  const showRegenerateLeaguePlayoffsRounds =
    isLeaguePlayoffs && hasLeagueMatches && !playoffsStarted && !tournament?.completed_at;

  // Custom League can also run a Semifinal/Final stage, but only when it's using
  // fixed teams throughout -- ad-hoc/dynamic pairing has no stable team identity to
  // seed a bracket from (a pairing might have played exactly one match all league).
  const customPlayoffsEligible = isCustom && !isDynamicMode;
  const supportsPlayoffs = isLeaguePlayoffs || customPlayoffsEligible;
  const playoffTeamCount = isCustom ? customFixedTeamCount : teamCount;

  const showGenerateSemifinals =
    supportsPlayoffs &&
    semifinalMatches.length === 0 &&
    !hasFinalMatch &&
    playoffTeamCount >= 4;
  const showSkipToFinal = showGenerateSemifinals;
  const showGenerateFinal = supportsPlayoffs && allSemifinalComplete && !hasFinalMatch;

  const leagueStandings = supportsPlayoffs
    ? computeStandings(
        leagueMatches.map(
          (m): MatchResult => ({
            teamAId: m.team_a_id!,
            teamBId: m.team_b_id,
            scoreA: m.score_a,
            scoreB: m.score_b,
            status: m.status as 'pending' | 'complete',
          })
        )
      )
    : [];

  type MatchRow = NonNullable<typeof matches>[number];
  const roundsFor = (list: MatchRow[]) => {
    const rounds = new Map<number, MatchRow[]>();
    for (const m of list) {
      const round = rounds.get(m.round) ?? [];
      round.push(m);
      rounds.set(m.round, round);
    }
    return rounds;
  };

  const leagueRoundsMap = roundsFor(leagueMatches);

  // Popcorn and Gauntlet re-pair players fresh each round, and Custom's auto-generate
  // (or an organizer who manually pairs fewer than all teams) can leave one team
  // unpaired for a round. Nothing persists who sat out, so derive it here: whoever
  // isn't on either team of any match in that round sat out. Other formats never leave
  // a registered player out of every match, so this is always empty for them.
  const showSitOuts = isPopcorn || isGauntlet || isCustom;
  const sitOutNamesByRound = new Map<number, string[]>();
  if (showSitOuts) {
    for (const [round, roundMatches] of leagueRoundsMap) {
      const playingIds = new Set<string>();
      for (const m of roundMatches) {
        for (const teamId of [m.team_a_id, m.team_b_id]) {
          const teamPlayers = teamId ? teamPlayerIdsById.get(teamId) : undefined;
          if (teamPlayers) teamPlayers.forEach((pid) => playingIds.add(pid));
        }
      }
      const sittingOut = (players ?? [])
        .filter((p) => !playingIds.has(p.id))
        .map((p) => p.name);
      if (sittingOut.length > 0) {
        sitOutNamesByRound.set(round, sittingOut);
      }
    }
  }

  const renderMatchList = (list: MatchRow[], isFinal: boolean = false) => (
    <ul className="space-y-2">
      {list.map((m) => {
        if (!m.team_b_id) {
          return isLeaguePlayoffs ? (
            <li key={m.id} className="text-sm text-slate-500 flex items-center gap-2">
              <span className="text-muted">Sitting out:</span>
              <span className="font-semibold text-slate-700">{teamById.get(m.team_a_id!) ?? 'Unknown'}</span>
            </li>
          ) : (
            <li key={m.id} className="text-sm text-slate-800 flex items-center gap-2">
              <span className="font-semibold">{teamById.get(m.team_a_id!) ?? 'Bye'}</span>
              <span className="text-muted">vs</span>
              <span className="font-semibold">BYE</span>
            </li>
          );
        }

        const isComplete = m.status === 'complete';
        const isSkipped = m.status === 'skipped';
        const teamAWon = isComplete && (m.score_a ?? 0) > (m.score_b ?? 0);
        const teamBWon = isComplete && (m.score_b ?? 0) > (m.score_a ?? 0);
        const enterScoreForMatch = enterScore.bind(null, id, m.id);
        const skipMatchForMatch = skipMatch.bind(null, id, m.id);
        const removeCustomMatchForMatch = removeCustomMatch.bind(null, id, m.id);
        const updateMatchTeamsForMatch = updateMatchTeams.bind(null, id, m.id);

        const teamALabel = (
          <span className={isFinal && teamAWon ? 'font-extrabold text-slate-900' : 'font-semibold'}>
            {isFinal && teamAWon && <span className="mr-1">🏆</span>}
            {teamById.get(m.team_a_id!)}
            {!isFinal && isComplete && (teamAWon || teamBWon) && (
              <span className={teamAWon ? 'text-navy-mid font-bold' : 'text-muted'}>
                {' '}
                ({teamAWon ? 'W' : 'L'})
              </span>
            )}
          </span>
        );
        const teamBLabel = (
          <span className={isFinal && teamBWon ? 'font-extrabold text-slate-900' : 'font-semibold'}>
            {isFinal && teamBWon && <span className="mr-1">🏆</span>}
            {teamById.get(m.team_b_id)}
            {!isFinal && isComplete && (teamAWon || teamBWon) && (
              <span className={teamBWon ? 'text-navy-mid font-bold' : 'text-muted'}>
                {' '}
                ({teamBWon ? 'W' : 'L'})
              </span>
            )}
          </span>
        );

        return (
          <li key={m.id} className="text-sm text-slate-800">
            <details open={canEditScoreValue && !isComplete && !isSkipped}>
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {m.court !== null && (
                    <span className="text-xs font-bold text-muted">
                      {isLadderFormat ? `C${m.court}` : courtLabel(m.court)}
                    </span>
                  )}
                  {teamALabel}
                  <span className="text-muted">vs</span>
                  {teamBLabel}
                </span>
                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {isComplete ? `${m.score_a}-${m.score_b}` : isSkipped ? 'Skipped' : 'Not yet played'}
                </span>
              </summary>
              {canEditScoreValue ? (
                <>
                  <form action={enterScoreForMatch} className="flex items-center gap-3 mt-2 pl-1">
                    <input
                      name="scoreA"
                      type="number"
                      defaultValue={m.score_a ?? ''}
                      placeholder="Team A"
                      required
                      className={`${inputClass} w-20 min-h-[48px] text-lg`}
                    />
                    <span className="text-muted font-bold">–</span>
                    <input
                      name="scoreB"
                      type="number"
                      defaultValue={m.score_b ?? ''}
                      placeholder="Team B"
                      required
                      className={`${inputClass} w-20 min-h-[48px] text-lg`}
                    />
                    <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
                      Save
                    </SaveButton>
                  </form>
                  {isSkipped ? (
                    <p className="text-xs text-muted mt-2 pl-1">
                      Marked as skipped — enter a score above to un-skip it.
                    </p>
                  ) : (
                    <form action={skipMatchForMatch} className="mt-2 pl-1">
                      <SaveButton
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline"
                        pendingLabel="Skipping…"
                      >
                        Skip this match (not played)
                      </SaveButton>
                    </form>
                  )}
                  {isCustom && !isComplete && (
                    <form action={removeCustomMatchForMatch} className="mt-2 pl-1">
                      <SaveButton
                        className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
                        pendingLabel="Removing…"
                      >
                        Remove match
                      </SaveButton>
                    </form>
                  )}
                </>
              ) : isSkipped ? (
                <p className="text-sm font-semibold text-slate-500 mt-2 pl-1">Skipped — not played.</p>
              ) : (
                <p className="text-sm font-semibold text-slate-700 mt-2 pl-1">
                  Final: {m.score_a}-{m.score_b}
                </p>
              )}
              {canEditTeamsValue && (
                <div className="mt-3 pl-1">
                  <p className="text-xs text-muted mb-2">
                    Standings recalculate automatically when you change a match&apos;s teams. Already-generated
                    semifinals, finals, and later rounds do <strong>not</strong> update — and if this tournament
                    has no final match, the champion shown elsewhere can change as a result.
                  </p>
                  <form action={updateMatchTeamsForMatch} className="flex items-center gap-3">
                    <select name="teamAId" defaultValue={m.team_a_id ?? ''} className={inputClass}>
                      {(teams ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {teamById.get(t.id)}
                        </option>
                      ))}
                    </select>
                    <span className="text-muted font-bold">vs</span>
                    <select name="teamBId" defaultValue={m.team_b_id ?? ''} className={inputClass}>
                      {(teams ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {teamById.get(t.id)}
                        </option>
                      ))}
                    </select>
                    <SaveButton className={primaryButtonClass} pendingLabel="Saving…">
                      Save Teams
                    </SaveButton>
                  </form>
                </div>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );

  return (
    <OrganizerShell organizerName={organizer.name}>
      <TournamentNav tournamentId={id} current="bracket" />
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-2xl ${headingClass}`}>Bracket</h1>
        <span className="text-sm font-semibold text-navy-mid bg-navy-tint rounded-full px-3 py-1">
          {formatLabel(format)}
        </span>
      </div>

      {tournament?.completed_at && (
        <form
          action={tournament?.results_unlocked_at ? lockTournamentResultsWithId : unlockTournamentResultsWithId}
          className="mb-6"
        >
          <SaveButton
            className={outlineButtonClass}
            pendingLabel={tournament?.results_unlocked_at ? 'Locking…' : 'Unlocking…'}
          >
            {tournament?.results_unlocked_at ? '🔒 Lock Editing' : '🔓 Unlock Editing'}
          </SaveButton>
        </form>
      )}

      <div className="mb-6">
        <ShareScheduleButton
          tournamentName={tournament?.name ?? ''}
          date={tournament?.date ?? ''}
          venueName={venueName}
          timeslotLabel={timeslotLabel(tournament?.timeslot ?? '')}
          formatLabel={formatLabel(format)}
          matchGroups={exportMatchGroups}
        />
        <p className="text-xs text-muted mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      {!isSupported && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          {formatLabel(format)} isn't available yet — bracket generation for this format is
          coming soon. Round Robin, League + Playoffs, Double Header, Popcorn, Gauntlet, Claim
          the Throne, Up and Down the River, and Custom League are the only formats that
          work today.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isPopcorn && playerCount < 4 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 4 players to generate a Popcorn schedule — you have {playerCount}. Go
          back and add more players first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isPopcorn && playerCount >= 4 && (
        <form action={generatePopcornBracketWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate the Popcorn schedule ({tournament?.popcorn_rounds ?? 5} rounds).
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Popcorn Schedule
          </SaveButton>
        </form>
      )}

      {isSupported && !hasLeagueMatches && isGauntlet && playerCount < 4 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 4 players to generate a Gauntlet round — you have {playerCount}. Go
          back and add more players first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isGauntlet && playerCount >= 4 && (
        <form action={advanceGauntletRoundWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {gauntletRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </form>
      )}

      {showGenerateNextGauntletRound && (
        <form action={advanceGauntletRoundWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            Round {currentGauntletRound} complete. Generate Round {currentGauntletRound + 1} of{' '}
            {gauntletRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentGauntletRound + 1}
          </SaveButton>
        </form>
      )}

      {showSkipGauntletRound && (
        <form action={advanceGauntletRoundWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            Round {currentGauntletRound} isn't finished yet. Skip it and generate Round{' '}
            {currentGauntletRound + 1} anyway — any unplayed matches in Round{' '}
            {currentGauntletRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentGauntletRound + 1}
          </SaveButton>
        </form>
      )}

      {isSupported && !hasLeagueMatches && isClaimTheThrone && !claimTheThronePlayerCountValid && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Claim the Throne needs a player count that's a multiple of 4 — you have {playerCount}.
          Go back and adjust the roster first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isClaimTheThrone && claimTheThronePlayerCountValid && (
        <form action={advanceClaimTheThroneRoundWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {claimTheThroneRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </form>
      )}

      {showGenerateNextClaimTheThroneRound && (
        <form
          action={advanceClaimTheThroneRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentClaimTheThroneRound} complete. Generate Round{' '}
            {currentClaimTheThroneRound + 1} of {claimTheThroneRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentClaimTheThroneRound + 1}
          </SaveButton>
        </form>
      )}

      {showSkipClaimTheThroneRound && (
        <form
          action={advanceClaimTheThroneRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentClaimTheThroneRound} isn't finished yet. Skip it and generate Round{' '}
            {currentClaimTheThroneRound + 1} anyway — any unplayed matches in Round{' '}
            {currentClaimTheThroneRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentClaimTheThroneRound + 1}
          </SaveButton>
        </form>
      )}

      {isSupported && !hasLeagueMatches && isUpAndDownRiver && !upAndDownRiverPlayerCountValid && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Up and Down the River needs a player count that's a multiple of 4 — you have{' '}
          {playerCount}. Go back and adjust the roster first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isUpAndDownRiver && upAndDownRiverPlayerCountValid && (
        <form
          action={advanceUpAndDownRiverRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {upAndDownRiverRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round 1
          </SaveButton>
        </form>
      )}

      {showGenerateNextUpAndDownRiverRound && (
        <form
          action={advanceUpAndDownRiverRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentUpAndDownRiverRound} complete. Generate Round{' '}
            {currentUpAndDownRiverRound + 1} of {upAndDownRiverRounds}.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Round {currentUpAndDownRiverRound + 1}
          </SaveButton>
        </form>
      )}

      {showSkipUpAndDownRiverRound && (
        <form
          action={advanceUpAndDownRiverRoundWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentUpAndDownRiverRound} isn't finished yet. Skip it and generate Round{' '}
            {currentUpAndDownRiverRound + 1} anyway — any unplayed matches in Round{' '}
            {currentUpAndDownRiverRound} stay unscored and won't count toward anyone's record.
          </p>
          <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
            Skip to Round {currentUpAndDownRiverRound + 1}
          </SaveButton>
        </form>
      )}

      {isSupported &&
        !hasLeagueMatches &&
        !isPopcorn &&
        !isGauntlet &&
        !isClaimTheThrone &&
        !isUpAndDownRiver &&
        !isLeaguePlayoffs &&
        !isCustom &&
        teamCount < 2 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 2 teams to generate a bracket — you have {teamCount}. Go back and
          pair more teams first.
        </div>
      )}

      {isSupported &&
        !hasLeagueMatches &&
        !isPopcorn &&
        !isGauntlet &&
        !isClaimTheThrone &&
        !isUpAndDownRiver &&
        !isLeaguePlayoffs &&
        !isCustom &&
        teamCount >= 2 && (
        <form action={generateBracketWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate a round-robin league schedule.
          </p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate League Bracket
          </SaveButton>
        </form>
      )}

      {isSupported && !hasLeagueMatches && isLeaguePlayoffs && teamCount < 2 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 2 teams to generate a bracket — you have {teamCount}. Go back and
          pair more teams first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isLeaguePlayoffs && teamCount >= 2 && (
        <form
          action={generateLeaguePlayoffsBracketWithId}
          className={`${actionCardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate the full League schedule.
          </p>
          <div className="mb-4 max-w-[140px] mx-auto text-left">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Number of rounds
            </label>
            <input
              name="rounds"
              type="number"
              defaultValue={leaguePlayoffsFullRounds}
              min={1}
              max={leaguePlayoffsFullRounds * MAX_LEAGUE_PLAYOFFS_ROUND_CYCLES}
              className={inputClass}
            />
            <p className="text-xs text-muted mt-1">
              Full round-robin is {leaguePlayoffsFullRounds}{' '}
              round{leaguePlayoffsFullRounds === 1 ? '' : 's'}. Ask for more to repeat it —
              e.g. {leaguePlayoffsFullRounds * 2} rounds plays everyone twice.
            </p>
          </div>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Full Schedule
          </SaveButton>
        </form>
      )}

      {showRegenerateLeaguePlayoffsRounds && (
        <div className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            Team roster changed? Regenerate the full {leaguePlayoffsRounds}-round schedule from
            the current teams.
          </p>
          <RegenerateLeagueRoundsButton
            regenerateAction={regenerateLeaguePlayoffsBracketWithId}
            hasScoredMatches={hasScoredLeagueMatches}
          />
        </div>
      )}

      {isCustom && canEditScoreValue && (
        <div className={`${actionCardClass} mb-6`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-1">
            Add Match
          </h2>
          <p className="text-xs text-muted mb-3">
            Target: {customTargetRounds} round{customTargetRounds === 1 ? '' : 's'} — highest
            round added so far: {currentCustomMaxRound || 'none yet'}.
          </p>
          {isDynamicMode && (
            <p className="text-xs text-navy-mid bg-navy-tint rounded-lg px-3 py-2 mb-3">
              A player is unpaired — matches are paired by individual player instead of saved
              teams until everyone has a fixed partner again.
            </p>
          )}
          {(isDynamicMode ? playerCount < 4 : customFixedTeamCount < 2) ? (
            <p className="text-sm text-red-700">
              {isDynamicMode
                ? 'Need at least 4 players before you can add a match.'
                : 'Need at least 2 teams before you can add a match — go back and pair more teams first.'}
            </p>
          ) : (
            <>
              {!isDynamicMode && (
                <p className="text-xs text-muted mb-3">
                  Full round-robin coverage for {customFixedTeamCount} team{customFixedTeamCount === 1 ? '' : 's'} needs{' '}
                  {customFullCoverageRoundsValue} round{customFullCoverageRoundsValue === 1 ? '' : 's'}.
                </p>
              )}
              {currentCustomMaxRound < customTargetRounds && (
                <form action={autoGenerateCustomRoundWithId} className="mb-4">
                  <SaveButton className={accentButtonClass} pendingLabel="Generating…">
                    Auto-generate Round {currentCustomMaxRound + 1}
                  </SaveButton>
                </form>
              )}
              <form action={addCustomMatchWithId} className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
                  <input
                    name="round"
                    type="number"
                    defaultValue={1}
                    min={1}
                    max={customTargetRounds}
                    required
                    className={`${inputClass} w-20`}
                  />
                </div>
                {isDynamicMode ? (
                  <>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team A — Player 1
                        </label>
                        <select name="teamAPlayer1Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team A — Player 2
                        </label>
                        <select name="teamAPlayer2Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <span className="text-muted font-bold pb-2">vs</span>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team B — Player 1
                        </label>
                        <select name="teamBPlayer1Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team B — Player 2
                        </label>
                        <select name="teamBPlayer2Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Team A</label>
                      <select name="teamAId" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Select team
                        </option>
                        {fixedTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamById.get(t.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="text-muted font-bold pb-2">vs</span>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Team B</label>
                      <select name="teamBId" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Select team
                        </option>
                        {fixedTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamById.get(t.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <SaveButton className={accentButtonClass} pendingLabel="Adding…">
                  Add Match
                </SaveButton>
              </form>
            </>
          )}
        </div>
      )}

      {hasLeagueMatches && (
        <div className="space-y-4 mb-6">
          {Array.from(leagueRoundsMap.entries()).map(([round, roundMatches]) => (
            <div key={round} className={cardClass}>
              <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-2">
                League — Round {round}
              </h2>
              {showSitOuts && sitOutNamesByRound.has(round) && (
                <p className="text-xs text-slate-500 mb-2">
                  Sitting out: {sitOutNamesByRound.get(round)!.join(', ')}
                </p>
              )}
              {renderMatchList(roundMatches)}
            </div>
          ))}
        </div>
      )}

      {supportsPlayoffs && allLeagueComplete && playoffTeamCount < 4 && (
        <div className="rounded-lg bg-navy-tint border border-navy-mid/25 text-navy-deep text-sm px-4 py-3 mb-6">
          Fewer than 4 teams — no playoff stage. {isCustom ? 'Individual' : 'League'} standings decide
          the champion.
        </div>
      )}

      {isCustom && isDynamicMode && allLeagueComplete && (
        <div className="rounded-lg bg-navy-tint border border-navy-mid/25 text-navy-deep text-sm px-4 py-3 mb-6">
          Playoffs need fixed teams for the whole league — this one used ad-hoc pairing, so
          there's no stable team to seed a bracket from. Individual standings decide the champion.
        </div>
      )}

      {showSkipToFinal && (
        <div className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {allLeagueComplete
              ? "League complete. Generate the semifinals from the top 4 teams, or skip straight to the final if you're short on time."
              : "Short on time? You don't have to finish every round — generate the semifinals from the top 4 teams by current standings, or skip straight to the final with the top 2."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <form action={generateSemifinalMatchesWithId}>
              <SaveButton className={accentButtonClass} pendingLabel="Generating…">
                Generate Semifinals
              </SaveButton>
            </form>
            <form action={skipToFinalMatchWithId}>
              <SaveButton className={outlineButtonClass} pendingLabel="Skipping…">
                Skip Semifinals — Go to Final
              </SaveButton>
            </form>
          </div>
        </div>
      )}

      {semifinalMatches.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-2">
            Semifinals
          </h2>
          {renderMatchList(semifinalMatches)}
        </div>
      )}

      {showGenerateFinal && (
        <form action={generateFinalMatchWithId} className={`${actionCardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">Semifinals complete. Generate the final.</p>
          <SaveButton className={accentButtonClass} pendingLabel="Generating…">
            Generate Final
          </SaveButton>
        </form>
      )}

      {finalMatches.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-2">Final</h2>
          {renderMatchList(finalMatches, true)}
        </div>
      )}

      {supportsPlayoffs && leagueStandings.length > 0 && (
        <div className={`${cardClass} mb-6 overflow-x-auto`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-2">
            {isCustom ? 'Team Standings (Playoff Seeding)' : 'League Standings'}
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
              {leagueStandings.map((s) => (
                <tr key={s.teamId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-semibold text-slate-900">{teamById.get(s.teamId)}</td>
                  <td className="py-2 text-center text-navy-mid font-bold">{s.wins}</td>
                  <td className="py-2 text-center text-slate-500">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasLeagueMatches && (
        <p className="mt-6 flex gap-4">
          <Link href={`/tournaments/${id}/standings`} className={linkClass}>
            View standings →
          </Link>
        </p>
      )}
    </OrganizerShell>
  );
}
