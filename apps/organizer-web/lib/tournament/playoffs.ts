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
