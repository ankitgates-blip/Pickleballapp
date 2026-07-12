// apps/organizer-web/app/tournaments/[id]/bracket/page.tsx
import Link from 'next/link';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import OrganizerShell from '@/app/components/OrganizerShell';
import TournamentNav from '@/app/components/TournamentNav';
import { cardClass, accentButtonClass, linkClass } from '@/app/components/ui';
import { formatLabel } from '@/lib/tournament/formats';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';
import { generateBracket, generatePopcornBracket, advanceGauntletRound, generateSemifinalMatches, generateFinalMatch } from './actions';

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizer } = await requireOrganizer();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format, popcorn_rounds, gauntlet_rounds')
    .eq('id', id)
    .single();

  const format = tournament?.format ?? 'round_robin';
  const isRoundRobin = format === 'round_robin';
  const isLeaguePlayoffs = format === 'league_playoffs';
  const isDoubleHeader = format === 'double_header';
  const isPopcorn = format === 'popcorn';
  const isGauntlet = format === 'gauntlet';
  const isSupported =
    isRoundRobin || isLeaguePlayoffs || isDoubleHeader || isPopcorn || isGauntlet;

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
    .select('id, round, stage, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true });

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

  const showGenerateSemifinals =
    isLeaguePlayoffs && allLeagueComplete && semifinalMatches.length === 0 && teamCount >= 4;
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

  const renderMatchList = (list: MatchRow[]) => (
    <ul className="space-y-2">
      {list.map((m) => (
        <li key={m.id} className="text-sm text-slate-800 flex items-center gap-2">
          <span className="font-semibold">{teamById.get(m.team_a_id!) ?? 'Bye'}</span>
          <span className="text-slate-400">vs</span>
          <span className="font-semibold">
            {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
          </span>
        </li>
      ))}
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

      {!isSupported && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          {formatLabel(format)} isn't available yet — bracket generation for this format is
          coming soon. Round Robin, League + Playoffs, Double Header, Popcorn, and Gauntlet are
          the only formats that work today.
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

      {isSupported && !hasLeagueMatches && !isPopcorn && !isGauntlet && teamCount < 2 && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          Need at least 2 teams to generate a bracket — you have {teamCount}. Go back and
          pair more teams first.
        </div>
      )}

      {isSupported && !hasLeagueMatches && !isPopcorn && !isGauntlet && teamCount >= 2 && (
        <form action={generateBracketWithId} className={`${cardClass} text-center mb-6`}>
          <p className="text-slate-600 mb-4">
            {teamCount} teams ready. Generate a round-robin league schedule.
          </p>
          <button type="submit" className={accentButtonClass}>
            Generate League Bracket
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

      {isLeaguePlayoffs && allLeagueComplete && teamCount < 4 && (
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
          {renderMatchList(finalMatches)}
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
