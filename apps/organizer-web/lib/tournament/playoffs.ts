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
