// apps/organizer-web/app/tournaments/[id]/matches/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { isTournamentComplete, canEditScore } from '@/lib/tournament/completion';

type OrganizerSupabase = Awaited<ReturnType<typeof requireOrganizer>>['supabase'];

// Shared by enterScore and skipMatch: after either one resolves a match (by
// scoring it or by skipping it), recompute whether the tournament as a whole
// is now complete and stamp completed_at if so. isTournamentComplete treats
// 'skipped' matches the same as 'complete' ones for this check.
async function checkAndMarkTournamentComplete(supabase: OrganizerSupabase, tournamentId: string) {
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select(
      'format, gauntlet_rounds, claim_the_throne_rounds, up_and_down_the_river_rounds, league_playoffs_rounds, custom_rounds'
    )
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const { count: teamCount, error: teamCountError } = await supabase
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (teamCountError) {
    throw new Error(teamCountError.message);
  }

  const { data: allMatches, error: matchesError } = await supabase
    .from('matches')
    .select('stage, status, team_b_id, round')
    .eq('tournament_id', tournamentId);

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const targetRounds =
    tournament?.format === 'gauntlet'
      ? (tournament?.gauntlet_rounds ?? 5)
      : tournament?.format === 'claim_the_throne'
        ? (tournament?.claim_the_throne_rounds ?? 5)
        : tournament?.format === 'up_and_down_the_river'
          ? (tournament?.up_and_down_the_river_rounds ?? 5)
          : tournament?.format === 'league_playoffs'
            ? (tournament?.league_playoffs_rounds ??
                ((teamCount ?? 0) % 2 === 0 ? (teamCount ?? 0) - 1 : (teamCount ?? 0)))
            : tournament?.format === 'custom'
              ? (tournament?.custom_rounds ?? 5)
              : undefined;

  const complete = isTournamentComplete(
    tournament?.format ?? 'round_robin',
    teamCount ?? 0,
    (allMatches ?? []).map((m) => ({
      stage: m.stage as 'league' | 'semifinal' | 'final',
      status: m.status as 'pending' | 'complete' | 'skipped',
      teamBId: m.team_b_id,
      round: m.round,
    })),
    targetRounds
  );

  if (complete) {
    const { error: completeError } = await supabase
      .from('tournaments')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', tournamentId)
      .is('completed_at', null);

    if (completeError) {
      throw new Error(completeError.message);
    }
  }
}

export async function enterScore(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to make a change.');
  }

  const scoreA = Number(formData.get('scoreA'));
  const scoreB = Number(formData.get('scoreB'));

  const { error } = await supabase
    .from('matches')
    .update({ score_a: scoreA, score_b: scoreB, status: 'complete' })
    .eq('id', matchId)
    .eq('tournament_id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  await checkAndMarkTournamentComplete(supabase, tournamentId);

  revalidatePath(`/tournaments/${tournamentId}/standings`);
  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath('/tournaments');
}

// Marks a match as deliberately not played, instead of leaving it stuck as
// "Not yet played" forever. A skipped match is excluded from standings and
// records exactly like a pending one is (computeStandings only reads
// 'complete' matches), but -- unlike pending -- counts as resolved for
// tournament-completion purposes, so one match nobody's going to play
// doesn't block the tournament from ever finishing. Entering a real score
// later overwrites the skip via enterScore, same as any other match.
export async function skipMatch(tournamentId: string, matchId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to make a change.');
  }

  const { error } = await supabase
    .from('matches')
    .update({ score_a: null, score_b: null, status: 'skipped' })
    .eq('id', matchId)
    .eq('tournament_id', tournamentId);

  if (error) {
    throw new Error(error.message);
  }

  await checkAndMarkTournamentComplete(supabase, tournamentId);

  revalidatePath(`/tournaments/${tournamentId}/standings`);
  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath('/tournaments');
}
