// apps/organizer-web/app/player-of-the-month/lockMissingWinners.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeTournamentChampionPersonIds } from '@/lib/tournament/champion';
import { rankMonthlyCandidates } from '@/lib/stats/playerOfTheMonth';
import { buildMonthlyCandidates } from '@/lib/stats/monthlyCandidates';
import { monthsToCheck } from '@/lib/stats/monthRange';
import type { RawMatch, RawTeam } from '@/lib/stats/types';

function monthDateRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const end = `${endYear}-${pad(endMonth)}-01`;
  return { start, end };
}

// Locks in the winner (or "nobody was eligible") for every completed month, for every
// venue, that hasn't been checked yet -- see monthsToCheck for why this checks a whole
// range rather than just "last month". Safe to call on every single page load: once a
// month has a row (winner or null), lock_player_of_the_month's on-conflict-do-nothing
// makes every later call for that same month a no-op. Tournaments are scoped to
// organizerId -- venues themselves are shared/global, but since locked rows never
// recompute, unscoped pooling across organizers would be permanent and unfixable.
export async function lockMissingPlayerOfTheMonthWinners(
  supabase: SupabaseClient,
  organizerId: string
): Promise<void> {
  const { data: venues } = await supabase.from('venues').select('id, name').order('name');
  if (!venues || venues.length === 0) return;

  const today = new Date();
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1;

  for (const venue of venues) {
    const { data: latestChecked } = await supabase
      .from('player_of_the_month')
      .select('year, month')
      .eq('venue_id', venue.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle();

    let startYear: number;
    let startMonth: number;

    if (latestChecked) {
      startMonth = latestChecked.month === 12 ? 1 : latestChecked.month + 1;
      startYear = latestChecked.month === 12 ? latestChecked.year + 1 : latestChecked.year;
    } else {
      const { data: earliestTournament } = await supabase
        .from('tournaments')
        .select('date')
        .eq('venue_id', venue.id)
        .eq('organizer_id', organizerId)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!earliestTournament) continue; // no tournaments ever at this venue -- nothing to check
      const [y, m] = earliestTournament.date.split('-').map(Number);
      startYear = y;
      startMonth = m;
    }

    const months = monthsToCheck(startYear, startMonth, todayYear, todayMonth);

    for (const { year, month } of months) {
      const { start, end } = monthDateRange(year, month);

      const { data: tournaments } = await supabase
        .from('tournaments')
        .select('id, date, format, completed_at')
        .eq('venue_id', venue.id)
        .eq('organizer_id', organizerId)
        .gte('date', start)
        .lt('date', end);

      if (!tournaments || tournaments.length === 0) {
        const { error } = await supabase.rpc('lock_player_of_the_month', {
          p_venue_id: venue.id,
          p_year: year,
          p_month: month,
          p_person_id: null,
          p_score: null,
          p_match_wins: null,
          p_league_wins: null,
          p_win_percentage: null,
          p_matches_played: null,
        });
        if (error) {
          // Stop checking further months for this venue -- the "start from most-recent
          // row + 1" logic on the next page load assumes every locked month is
          // contiguous, so locking a later month while this one silently failed would
          // permanently strand this month unchecked.
          console.error('lockMissingPlayerOfTheMonthWinners: lock RPC failed', venue.id, year, month, error);
          break;
        }
        continue;
      }

      const tournamentIds = tournaments.map((t) => t.id);
      const tournamentDateById = new Map(tournaments.map((t) => [t.id, t.date]));

      const { data: teamsRaw } = await supabase
        .from('teams')
        .select('id, tournament_id, player_1_id, player_2_id')
        .in('tournament_id', tournamentIds);
      const { data: playersRaw } = await supabase
        .from('players')
        .select('id, tournament_id, person_id')
        .in('tournament_id', tournamentIds);
      const { data: matchesRaw } = await supabase
        .from('matches')
        .select('tournament_id, stage, team_a_id, team_b_id, score_a, score_b, status, round, court')
        .in('tournament_id', tournamentIds);

      const personIdByPlayerId = new Map((playersRaw ?? []).map((p) => [p.id, p.person_id as string | null]));

      const teams: RawTeam[] = (teamsRaw ?? [])
        .map((t) => ({
          id: t.id,
          tournamentId: t.tournament_id,
          player1PersonId: personIdByPlayerId.get(t.player_1_id) ?? '',
          player2PersonId: personIdByPlayerId.get(t.player_2_id) ?? '',
        }))
        .filter((t) => t.player1PersonId && t.player2PersonId);

      const matches: RawMatch[] = (matchesRaw ?? [])
        .filter((m) => m.team_b_id !== null && m.status === 'complete')
        .map((m) => ({
          tournamentId: m.tournament_id,
          tournamentDate: tournamentDateById.get(m.tournament_id) ?? '',
          venueName: venue.name,
          teamAId: m.team_a_id!,
          teamBId: m.team_b_id!,
          scoreA: m.score_a ?? 0,
          scoreB: m.score_b ?? 0,
          status: 'complete' as const,
        }));

      const leagueWinsByPersonId = new Map<string, number>();
      for (const tournament of tournaments) {
        const tournamentTeams = (teamsRaw ?? [])
          .filter((t) => t.tournament_id === tournament.id)
          .map((t) => {
            const p1 = personIdByPlayerId.get(t.player_1_id);
            const p2 = personIdByPlayerId.get(t.player_2_id);
            return p1 && p2 ? { id: t.id, person1Id: p1, person2Id: p2 } : null;
          })
          .filter((t): t is { id: string; person1Id: string; person2Id: string } => t !== null);
        const tournamentMatches = (matchesRaw ?? []).filter((m) => m.tournament_id === tournament.id);

        const championPersonIds = computeTournamentChampionPersonIds({
          format: tournament.format,
          completedAt: tournament.completed_at,
          matches: tournamentMatches,
          teams: tournamentTeams,
        });
        for (const personId of championPersonIds ?? []) {
          leagueWinsByPersonId.set(personId, (leagueWinsByPersonId.get(personId) ?? 0) + 1);
        }
      }

      const candidates = buildMonthlyCandidates(matches, teams, leagueWinsByPersonId);
      const ranked = rankMonthlyCandidates(candidates);
      const winner = ranked[0] ?? null;

      const { error } = await supabase.rpc('lock_player_of_the_month', {
        p_venue_id: venue.id,
        p_year: year,
        p_month: month,
        p_person_id: winner?.personId ?? null,
        p_score: winner?.score ?? null,
        p_match_wins: winner?.matchWins ?? null,
        p_league_wins: winner?.leagueWins ?? null,
        p_win_percentage: winner?.winPercentage ?? null,
        p_matches_played: winner?.matchesPlayed ?? null,
      });
      if (error) {
        console.error('lockMissingPlayerOfTheMonthWinners: lock RPC failed', venue.id, year, month, error);
        break;
      }
    }
  }
}
