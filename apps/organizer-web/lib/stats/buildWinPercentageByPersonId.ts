import { buildPersonMatchRecords } from './buildPersonMatchRecords';
import { winPercentageFromRecords } from './winRate';
import type { RawMatch, RawTeam } from './types';

type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

// Roster and Teams pages both need each rostered player's OVERALL win percentage
// (across every tournament with this organizer, not just the current one) to feed
// ThreatBadge -- previously ~65 lines of identical query/mapping code duplicated
// in both pages. Centralized here instead.
export async function buildWinPercentageByPersonId(
  supabase: SupabaseLike,
  organizerId: string,
  personIds: (string | null)[]
): Promise<Map<string, number | null>> {
  const { data: allTournaments } = await supabase
    .from('tournaments')
    .select('id')
    .eq('organizer_id', organizerId);

  const allTournamentIds = (allTournaments ?? []).map((t: { id: string }) => t.id);

  const { data: allTeamsRaw } = allTournamentIds.length
    ? await supabase
        .from('teams')
        .select('id, player_1_id, player_2_id')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const { data: allPlayersRaw } = allTournamentIds.length
    ? await supabase.from('players').select('id, person_id').in('tournament_id', allTournamentIds)
    : { data: [] };

  const { data: allMatchesRaw } = allTournamentIds.length
    ? await supabase
        .from('matches')
        .select('tournament_id, team_a_id, team_b_id, score_a, score_b, status')
        .in('tournament_id', allTournamentIds)
    : { data: [] };

  const personIdByAllPlayerId = new Map(
    (allPlayersRaw ?? []).map((p: { id: string; person_id: string | null }) => [p.id, p.person_id])
  );

  // tournamentId/tournamentDate/venueName never affect buildPersonMatchRecords' output beyond
  // being copied through — only `.won` is read off the resulting records — so they're left as
  // placeholders here.
  const allTeams: RawTeam[] = (allTeamsRaw ?? [])
    .map((t: { id: string; player_1_id: string; player_2_id: string }) => ({
      id: t.id,
      tournamentId: '',
      player1PersonId: personIdByAllPlayerId.get(t.player_1_id) ?? '',
      player2PersonId: personIdByAllPlayerId.get(t.player_2_id) ?? '',
    }))
    .filter((t: RawTeam) => t.player1PersonId && t.player2PersonId);

  const allCompleteMatches: RawMatch[] = (allMatchesRaw ?? [])
    .filter(
      (m: { team_b_id: string | null; status: string }) =>
        m.team_b_id !== null && m.status === 'complete'
    )
    .map(
      (m: {
        tournament_id: string;
        team_a_id: string | null;
        team_b_id: string | null;
        score_a: number | null;
        score_b: number | null;
      }) => ({
        tournamentId: m.tournament_id,
        tournamentDate: '',
        venueName: '',
        teamAId: m.team_a_id!,
        teamBId: m.team_b_id!,
        scoreA: m.score_a ?? 0,
        scoreB: m.score_b ?? 0,
        status: 'complete' as const,
      })
    );

  const winPercentageByPersonId = new Map<string, number | null>();
  for (const personId of personIds) {
    if (!personId || winPercentageByPersonId.has(personId)) continue;
    winPercentageByPersonId.set(
      personId,
      winPercentageFromRecords(buildPersonMatchRecords(personId, allCompleteMatches, allTeams))
    );
  }

  return winPercentageByPersonId;
}
