import type { RoundRobinPairing } from '@/lib/types';

export function generateRoundRobin(teamIds: string[]): RoundRobinPairing[] {
  if (teamIds.length < 2) {
    throw new Error('Round robin requires at least 2 teams');
  }

  const ids: (string | null)[] = [...teamIds];
  if (ids.length % 2 !== 0) {
    ids.push(null); // bye sentinel
  }

  const numRounds = ids.length - 1;
  const half = ids.length / 2;
  const fixed = ids[0];
  const rotating = ids.slice(1);
  const pairings: RoundRobinPairing[] = [];

  for (let round = 0; round < numRounds; round++) {
    const roundTeams = [fixed, ...rotating];

    for (let i = 0; i < half; i++) {
      const teamA = roundTeams[i];
      const teamB = roundTeams[roundTeams.length - 1 - i];

      if (teamA === null && teamB === null) continue;

      if (teamA === null) {
        pairings.push({ round: round + 1, teamAId: teamB as string, teamBId: null });
      } else if (teamB === null) {
        pairings.push({ round: round + 1, teamAId: teamA, teamBId: null });
      } else {
        pairings.push({ round: round + 1, teamAId: teamA, teamBId: teamB });
      }
    }

    rotating.unshift(rotating.pop() as string | null);
  }

  return pairings;
}
