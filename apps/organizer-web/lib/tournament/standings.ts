import type { IndividualStandingsRow, MatchResult, StandingsRow, Team } from '@/lib/types';

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

export function computeIndividualStandings(
  matches: MatchResult[],
  teams: Team[]
): IndividualStandingsRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const table = new Map<string, IndividualStandingsRow>();

  const ensure = (playerId: string): IndividualStandingsRow => {
    let row = table.get(playerId);
    if (!row) {
      row = { playerId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
      table.set(playerId, row);
    }
    return row;
  };

  for (const match of matches) {
    if (match.status !== 'complete' || match.teamBId === null) continue;
    if (match.scoreA === null || match.scoreB === null) continue;

    const teamA = teamById.get(match.teamAId);
    const teamB = teamById.get(match.teamBId);
    if (!teamA || !teamB) continue;

    const teamAWon = match.scoreA > match.scoreB;

    for (const playerId of [teamA.player1Id, teamA.player2Id]) {
      const row = ensure(playerId);
      row.pointsFor += match.scoreA;
      row.pointsAgainst += match.scoreB;
      if (teamAWon) row.wins += 1;
      else row.losses += 1;
    }

    for (const playerId of [teamB.player1Id, teamB.player2Id]) {
      const row = ensure(playerId);
      row.pointsFor += match.scoreB;
      row.pointsAgainst += match.scoreA;
      if (teamAWon) row.losses += 1;
      else row.wins += 1;
    }
  }

  return Array.from(table.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
  });
}
