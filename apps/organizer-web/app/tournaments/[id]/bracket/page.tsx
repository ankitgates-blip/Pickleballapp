// apps/organizer-web/app/tournaments/[id]/bracket/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, accentButtonClass, linkClass, inputClass, primaryButtonClass } from '@/app/components/ui';
import { formatLabel } from '@/lib/tournament/formats';
import { timeslotLabel } from '@/lib/tournament/timeslots';
import { computeStandings } from '@/lib/tournament/standings';
import { buildMatchGroups } from '@/lib/tournament/resultsExport';
import type { MatchResult } from '@/lib/types';
import { generateBracket, generatePopcornBracket, advanceGauntletRound, advanceClaimTheThroneRound, advanceUpAndDownRiverRound, advanceLeaguePlayoffsRound, generateSemifinalMatches, generateFinalMatch, updateMatchTeams } from './actions';
import { enterScore } from '../matches/actions';
import ShareScheduleButton from './ShareScheduleButton';

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
      'name, date, timeslot, format, popcorn_rounds, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, venues(name)'
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
  const isSupported =
    isRoundRobin ||
    isLeaguePlayoffs ||
    isDoubleHeader ||
    isPopcorn ||
    isGauntlet ||
    isClaimTheThrone ||
    isUpAndDownRiver;

  const venue = tournament?.venues as { name: string } | { name: string }[] | null;
  const venueName = Array.isArray(venue) ? (venue[0]?.name ?? 'Pickle Turf') : (venue?.name ?? 'Pickle Turf');

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
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status, court')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

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

  const teamCount = (teams ?? []).length;
  const playerCount = (players ?? []).length;

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

  const generateBracketWithId = generateBracket.bind(null, id);
  const generatePopcornBracketWithId = generatePopcornBracket.bind(null, id);
  const advanceGauntletRoundWithId = advanceGauntletRound.bind(null, id);
  const advanceClaimTheThroneRoundWithId = advanceClaimTheThroneRound.bind(null, id);
  const advanceUpAndDownRiverRoundWithId = advanceUpAndDownRiverRound.bind(null, id);
  const advanceLeaguePlayoffsRoundWithId = advanceLeaguePlayoffsRound.bind(null, id);
  const generateSemifinalMatchesWithId = generateSemifinalMatches.bind(null, id);
  const generateFinalMatchWithId = generateFinalMatch.bind(null, id);

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
  const upAndDownRiverPlayerCountValid = playerCount > 0 && playerCount % 4 === 0;

  const leaguePlayoffsFullRounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  const leaguePlayoffsRounds = tournament?.league_playoffs_rounds ?? leaguePlayoffsFullRounds;
  const currentLeaguePlayoffsRound =
    leagueMatches.length > 0 ? Math.max(...leagueMatches.map((m) => m.round)) : 0;
  const currentLeaguePlayoffsRoundMatches = leagueMatches.filter(
    (m) => m.round === currentLeaguePlayoffsRound
  );
  const currentLeaguePlayoffsRoundComplete =
    currentLeaguePlayoffsRoundMatches.length > 0 &&
    currentLeaguePlayoffsRoundMatches.every((m) => m.status === 'complete');
  const showGenerateNextLeaguePlayoffsRound =
    isLeaguePlayoffs &&
    hasLeagueMatches &&
    currentLeaguePlayoffsRoundComplete &&
    currentLeaguePlayoffsRound < leaguePlayoffsRounds;
  const leaguePlayoffsRoundsComplete = currentLeaguePlayoffsRound >= leaguePlayoffsRounds;

  const showGenerateSemifinals =
    isLeaguePlayoffs &&
    allLeagueComplete &&
    leaguePlayoffsRoundsComplete &&
    semifinalMatches.length === 0 &&
    teamCount >= 4;
  const showGenerateFinal = isLeaguePlayoffs && allSemifinalComplete && !hasFinalMatch;

  const leagueStandings = isLeaguePlayoffs
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

  const renderMatchList = (list: MatchRow[], isFinal: boolean = false) => (
    <ul className="space-y-2">
      {list.map((m) => {
        if (!m.team_b_id) {
          return (
            <li key={m.id} className="text-sm text-slate-800 flex items-center gap-2">
              <span className="font-semibold">{teamById.get(m.team_a_id!) ?? 'Bye'}</span>
              <span className="text-slate-400">vs</span>
              <span className="font-semibold">BYE</span>
            </li>
          );
        }

        const isComplete = m.status === 'complete';
        const teamAWon = isComplete && (m.score_a ?? 0) > (m.score_b ?? 0);
        const teamBWon = isComplete && (m.score_b ?? 0) > (m.score_a ?? 0);
        const enterScoreForMatch = enterScore.bind(null, id, m.id);
        const updateMatchTeamsForMatch = updateMatchTeams.bind(null, id, m.id);

        const teamALabel = (
          <span className={isFinal && teamAWon ? 'font-extrabold text-slate-900' : 'font-semibold'}>
            {isFinal && teamAWon && <span className="mr-1">🏆</span>}
            {teamById.get(m.team_a_id!)}
            {!isFinal && isComplete && (teamAWon || teamBWon) && (
              <span className={teamAWon ? 'text-teal-700 font-bold' : 'text-slate-400'}>
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
              <span className={teamBWon ? 'text-teal-700 font-bold' : 'text-slate-400'}>
                {' '}
                ({teamBWon ? 'W' : 'L'})
              </span>
            )}
          </span>
        );

        return (
          <li key={m.id} className="text-sm text-slate-800">
            <details>
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {m.court !== null && (
                    <span className="text-xs font-bold text-slate-400">C{m.court}</span>
                  )}
                  {teamALabel}
                  <span className="text-slate-400">vs</span>
                  {teamBLabel}
                </span>
                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {isComplete ? `${m.score_a}-${m.score_b}` : 'Not yet played'}
                </span>
              </summary>
              <form action={enterScoreForMatch} className="flex items-center gap-3 mt-2 pl-1">
                <input
                  name="scoreA"
                  type="number"
                  defaultValue={m.score_a ?? ''}
                  placeholder="Team A"
                  required
                  className={`${inputClass} w-20`}
                />
                <span className="text-slate-400 font-bold">–</span>
                <input
                  name="scoreB"
                  type="number"
                  defaultValue={m.score_b ?? ''}
                  placeholder="Team B"
                  required
                  className={`${inputClass} w-20`}
                />
                <button type="submit" className={primaryButtonClass}>
                  Save
                </button>
              </form>
              <div className="mt-3 pl-1">
                <p className="text-xs text-slate-400 mb-2">
                  Changing a match&apos;s teams doesn&apos;t recompute any standings, seeding, or
                  later rounds already generated from it — double-check anything downstream that
                  depended on this match.
                </p>
                <form action={updateMatchTeamsForMatch} className="flex items-center gap-3">
                  <select name="teamAId" defaultValue={m.team_a_id ?? ''} className={inputClass}>
                    {(teams ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamById.get(t.id)}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400 font-bold">vs</span>
                  <select name="teamBId" defaultValue={m.team_b_id ?? ''} className={inputClass}>
                    {(teams ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamById.get(t.id)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={primaryButtonClass}>
                    Save Teams
                  </button>
                </form>
              </div>
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
        <h1 className="text-2xl font-extrabold text-slate-900">Bracket</h1>
        <span className="text-sm font-semibold text-teal-700 bg-teal-50 rounded-full px-3 py-1">
          {formatLabel(format)}
        </span>
      </div>

      <div className="mb-6">
        <ShareScheduleButton
          tournamentName={tournament?.name ?? ''}
          date={tournament?.date ?? ''}
          venueName={venueName}
          timeslotLabel={timeslotLabel(tournament?.timeslot ?? '')}
          formatLabel={formatLabel(format)}
          matchGroups={exportMatchGroups}
        />
        <p className="text-xs text-slate-400 mt-1.5">
          Opens your share sheet on mobile — downloads the file on desktop.
        </p>
      </div>

      {!isSupported && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          {formatLabel(format)} isn't available yet — bracket generation for this format is
          coming soon. Round Robin, League + Playoffs, Double Header, Popcorn, Gauntlet, Claim
          the Throne, and Up and Down the River are the only formats that work today.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isPopcorn && playerCount < 4 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 4 players to generate a Popcorn schedule — you have {playerCount}. Go
          back and add more players first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isPopcorn && playerCount >= 4 && (
        <form action={generatePopcornBracketWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate the Popcorn schedule ({tournament?.popcorn_rounds ?? 5} rounds).
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Popcorn Schedule
          </button>
        </form>
      )}

      {isSupported && !hasLeagueMatches && isGauntlet && playerCount < 4 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 4 players to generate a Gauntlet round — you have {playerCount}. Go
          back and add more players first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isGauntlet && playerCount >= 4 && (
        <form action={advanceGauntletRoundWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {gauntletRounds}.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round 1
          </button>
        </form>
      )}

      {showGenerateNextGauntletRound && (
        <form action={advanceGauntletRoundWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            Round {currentGauntletRound} complete. Generate Round {currentGauntletRound + 1} of{' '}
            {gauntletRounds}.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round {currentGauntletRound + 1}
          </button>
        </form>
      )}

      {isSupported && !hasLeagueMatches && isClaimTheThrone && !claimTheThronePlayerCountValid && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Claim the Throne needs a player count that's a multiple of 4 — you have {playerCount}.
          Go back and adjust the roster first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && isClaimTheThrone && claimTheThronePlayerCountValid && (
        <form action={advanceClaimTheThroneRoundWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {claimTheThroneRounds}.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round 1
          </button>
        </form>
      )}

      {showGenerateNextClaimTheThroneRound && (
        <form
          action={advanceClaimTheThroneRoundWithId}
          className={`${cardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentClaimTheThroneRound} complete. Generate Round{' '}
            {currentClaimTheThroneRound + 1} of {claimTheThroneRounds}.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round {currentClaimTheThroneRound + 1}
          </button>
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
          className={`${cardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            {playerCount} players ready. Generate Round 1 of {upAndDownRiverRounds}.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round 1
          </button>
        </form>
      )}

      {showGenerateNextUpAndDownRiverRound && (
        <form
          action={advanceUpAndDownRiverRoundWithId}
          className={`${cardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentUpAndDownRiverRound} complete. Generate Round{' '}
            {currentUpAndDownRiverRound + 1} of {upAndDownRiverRounds}.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round {currentUpAndDownRiverRound + 1}
          </button>
        </form>
      )}

      {isSupported &&
        !hasLeagueMatches &&
        !isPopcorn &&
        !isGauntlet &&
        !isClaimTheThrone &&
        !isUpAndDownRiver &&
        !isLeaguePlayoffs &&
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
        teamCount >= 2 && (
        <form action={generateBracketWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate a round-robin league schedule.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate League Bracket
          </button>
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
          action={advanceLeaguePlayoffsRoundWithId}
          className={`${cardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate Round 1 of {leaguePlayoffsFullRounds}.
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
              max={leaguePlayoffsFullRounds}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">
              Full round-robin is {leaguePlayoffsFullRounds}{' '}
              round{leaguePlayoffsFullRounds === 1 ? '' : 's'}.
            </p>
          </div>
          <button type="submit" className={accentButtonClass}>
            Generate Round 1
          </button>
        </form>
      )}

      {showGenerateNextLeaguePlayoffsRound && (
        <form
          action={advanceLeaguePlayoffsRoundWithId}
          className={`${cardClass} text-center mb-6`}
        >
          <p className="text-slate-600 mb-4">
            Round {currentLeaguePlayoffsRound} complete. Generate Round{' '}
            {currentLeaguePlayoffsRound + 1} of {leaguePlayoffsRounds}.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Round {currentLeaguePlayoffsRound + 1}
          </button>
        </form>
      )}

      {hasLeagueMatches && (
        <div className="space-y-4 mb-6">
          {Array.from(roundsFor(leagueMatches).entries()).map(([round, roundMatches]) => (
            <div key={round} className={cardClass}>
              <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">
                League — Round {round}
              </h2>
              {renderMatchList(roundMatches)}
            </div>
          ))}
        </div>
      )}

      {isLeaguePlayoffs && allLeagueComplete && leaguePlayoffsRoundsComplete && teamCount < 4 && (
        <div className="rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm px-4 py-3 mb-6">
          Fewer than 4 teams — no playoff stage. League standings decide the champion.
        </div>
      )}

      {showGenerateSemifinals && (
        <form action={generateSemifinalMatchesWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            League complete. Generate the semifinals from the top 4 teams.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate Semifinals
          </button>
        </form>
      )}

      {semifinalMatches.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">
            Semifinals
          </h2>
          {renderMatchList(semifinalMatches)}
        </div>
      )}

      {showGenerateFinal && (
        <form action={generateFinalMatchWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">Semifinals complete. Generate the final.</p>
          <button type="submit" className={accentButtonClass}>
            Generate Final
          </button>
        </form>
      )}

      {finalMatches.length > 0 && (
        <div className={`${cardClass} mb-6`}>
          <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">Final</h2>
          {renderMatchList(finalMatches, true)}
        </div>
      )}

      {isLeaguePlayoffs && leagueStandings.length > 0 && (
        <div className={`${cardClass} mb-6 overflow-x-auto`}>
          <h2 className="text-sm font-bold text-teal-700 uppercase tracking-wide mb-2">
            League Standings
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
                  <td className="py-2 text-center text-teal-700 font-bold">{s.wins}</td>
                  <td className="py-2 text-center text-slate-500">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasLeagueMatches && (
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
