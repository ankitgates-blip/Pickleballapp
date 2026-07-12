// apps/organizer-web/app/tournaments/[id]/matches/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { isTournamentComplete } from '@/lib/tournament/completion';

export async function enterScore(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  const { supabase } = await requireOrganizer();

  const scoreA = Number(formData.get('scoreA'));
  const scoreB = Number(formData.get('scoreB'));

  const { error } = await supabase
    .from('matches')
    .update({ score_a: scoreA, score_b: scoreB, status: 'complete' })
    .eq('id', matchId);

  if (error) {
    throw new Error(error.message);
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, gauntlet_rounds, claim_the_throne_rounds')
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
        : undefined;

  const complete = isTournamentComplete(
    tournament?.format ?? 'round_robin',
    teamCount ?? 0,
    (allMatches ?? []).map((m) => ({
      stage: m.stage as 'league' | 'semifinal' | 'final',
      status: m.status as 'pending' | 'complete',
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

  revalidatePath(`/tournaments/${tournamentId}/matches`);
  revalidatePath(`/tournaments/${tournamentId}/standings`);
  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath('/tournaments');
}
