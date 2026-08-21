import type { StandingsRow } from '@/lib/types';

export function generateSemifinals(
  standings: StandingsRow[]
): Array<{ teamAId: string; teamBId: string }> {
  if (standings.length < 4) {
    throw new Error('Need at least 4 teams in standings to generate semifinals');
  }

  const [first, second, third, fourth] = standings;

  return [
    { teamAId: first.teamId, teamBId: fourth.teamId },
    { teamAId: second.teamId, teamBId: third.teamId },
  ];
}

export function pickFinalists(
  standings: StandingsRow[]
): { teamAId: string; teamBId: string } {
  if (standings.length < 2) {
    throw new Error('Need at least 2 teams in standings to pick finalists');
  }

  const [first, second] = standings;

  return { teamAId: first.teamId, teamBId: second.teamId };
}

export function fillStandingsGaps(
  standings: StandingsRow[],
  teamIds: string[]
): StandingsRow[] {
  const seen = new Set(standings.map((s) => s.teamId));
  const missing: StandingsRow[] = teamIds
    .filter((teamId) => !seen.has(teamId))
    .map((teamId) => ({ teamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }));

  return [...standings, ...missing];
}
