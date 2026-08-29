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

// League + Playoffs lets an organizer request more rounds than a single full
// round-robin cycle covers (everyone plays everyone once) -- up to this many
// repeats of that cycle, back to back, each repeat picking up the round
// numbering where the previous one left off. A generous ceiling rather than
// unlimited: enough for a season of repeat play without an open-ended input.
export const MAX_LEAGUE_PLAYOFFS_ROUND_CYCLES = 3;

// Repeats a single round-robin cycle back to back until `targetRounds` is
// covered, then trims the final partial cycle down to exactly that many
// rounds. For targetRounds <= one cycle's length this is identical to a
// plain generateRoundRobin(...).filter(p => p.round <= targetRounds) -- the
// repeats only kick in once more rounds are requested than one cycle has.
export function generateMultiCycleRoundRobin(
  teamIds: string[],
  targetRounds: number
): RoundRobinPairing[] {
  const singleCycle = generateRoundRobin(teamIds);
  const cycleLength = Math.max(...singleCycle.map((p) => p.round));
  const cyclesNeeded = Math.max(1, Math.ceil(targetRounds / cycleLength));

  const pairings: RoundRobinPairing[] = [];
  for (let cycle = 0; cycle < cyclesNeeded; cycle++) {
    for (const p of singleCycle) {
      const round = p.round + cycle * cycleLength;
      if (round > targetRounds) continue;
      pairings.push({ ...p, round });
    }
  }
  return pairings;
}

export function generateDoubleHeaderRoundRobin(teamIds: string[]): RoundRobinPairing[] {
  const singleRound = generateRoundRobin(teamIds);
  const doubled: RoundRobinPairing[] = [];

  for (const pairing of singleRound) {
    doubled.push(pairing);
    if (pairing.teamBId !== null) {
      doubled.push({ ...pairing });
    }
  }

  return doubled;
}
