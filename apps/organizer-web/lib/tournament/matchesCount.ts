// Counts matches that were actually played -- excludes bye/sit-out placeholder rows
// (team_b_id null, inserted for league_playoffs when a round has an odd team out) and
// matches the organizer explicitly skipped (status 'skipped'). Same exclusion rule
// standings.ts and champion.ts already use when computing real match outcomes,
// applied here for the Tournaments list card's MATCHES stat, which previously counted
// every raw row -- byes and skips included -- overcounting for any tournament with
// either.
export function countPlayedMatches(matches: { team_b_id: string | null; status: string }[]): number {
  return matches.filter((m) => m.team_b_id !== null && m.status === 'complete').length;
}
