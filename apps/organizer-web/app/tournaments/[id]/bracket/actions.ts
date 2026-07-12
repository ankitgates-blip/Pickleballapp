// apps/organizer-web/app/tournaments/[id]/bracket/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizer } from '@/lib/supabase/requireOrganizer';
import { generateRoundRobin, generateDoubleHeaderRoundRobin } from '@/lib/tournament/roundRobin';
import { generateSemifinals } from '@/lib/tournament/playoffs';
import { computeStandings } from '@/lib/tournament/standings';
import type { MatchResult } from '@/lib/types';

export async function generateBracket(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to generate a bracket');
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  const pairings =
    tournament?.format === 'double_header'
      ? generateDoubleHeaderRoundRobin(teams.map((t) => t.id))
      : generateRoundRobin(teams.map((t) => t.id));

  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function generateSemifinalMatches(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: leagueMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const matchResults: MatchResult[] = (leagueMatches ?? []).map((m) => ({
    teamAId: m.team_a_id!,
    teamBId: m.team_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    status: m.status as 'pending' | 'complete',
  }));

  const standings = computeStandings(matchResults);
  const pairings = generateSemifinals(standings.slice(0, 4));

  const { error: insertError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: 1,
      stage: 'semifinal' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}

export async function generateFinalMatch(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: semifinalMatches, error: matchesError } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'semifinal');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  if (
    !semifinalMatches ||
    semifinalMatches.length !== 2 ||
    semifinalMatches.some((m) => m.status !== 'complete')
  ) {
    throw new Error('Both semifinal matches must be complete before generating the final');
  }

  const winners = semifinalMatches.map((m) =>
    (m.score_a ?? 0) > (m.score_b ?? 0) ? m.team_a_id! : m.team_b_id!
  );

  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: winners[0],
    team_b_id: winners[1],
    status: 'pending' as const,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
