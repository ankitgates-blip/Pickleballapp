import type { MatchResult, StandingsRow } from '@/lib/types';

export function computeStandings(matches: MatchResult[]): StandingsRow[] {
  const table = new Map<string, StandingsRow>();

  const ensure = (teamId: string): StandingsRow => {
    let row = table.get(teamId);
    if (!row) {
      row = { teamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
      table.set(teamId, row);
    }
    return row;
  };

  for (const match of matches) {
    if (match.status !== 'complete' || match.teamBId === null) continue;
    if (match.scoreA === null || match.scoreB === null) continue;

    const teamA = ensure(match.teamAId);
    const teamB = ensure(match.teamBId);

    teamA.pointsFor += match.scoreA;
    teamA.pointsAgainst += match.scoreB;
    teamB.pointsFor += match.scoreB;
    teamB.pointsAgainst += match.scoreA;

    if (match.scoreA > match.scoreB) {
      teamA.wins += 1;
      teamB.losses += 1;
    } else {
      teamB.wins += 1;
      teamA.losses += 1;
    }
  }

  return Array.from(table.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
  });
}
