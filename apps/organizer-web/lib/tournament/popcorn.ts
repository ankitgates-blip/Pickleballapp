import type { PopcornPairing } from '@/lib/types';

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function groupCost(
  group: string[],
  partnerHistory: Map<string, Set<string>>,
  opponentHistory: Map<string, Set<string>>
): number {
  let cost = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (partnerHistory.get(group[i])!.has(group[j])) cost += 1;
      if (opponentHistory.get(group[i])!.has(group[j])) cost += 1;
    }
  }
  return cost;
}

function splitCost(
  teamA: [string, string],
  teamB: [string, string],
  partnerHistory: Map<string, Set<string>>
): number {
  let cost = 0;
  if (partnerHistory.get(teamA[0])!.has(teamA[1])) cost += 1;
  if (partnerHistory.get(teamB[0])!.has(teamB[1])) cost += 1;
  return cost;
}

function recordHistory(
  teamA: [string, string],
  teamB: [string, string],
  partnerHistory: Map<string, Set<string>>,
  opponentHistory: Map<string, Set<string>>
): void {
  partnerHistory.get(teamA[0])!.add(teamA[1]);
  partnerHistory.get(teamA[1])!.add(teamA[0]);
  partnerHistory.get(teamB[0])!.add(teamB[1]);
  partnerHistory.get(teamB[1])!.add(teamB[0]);

  for (const a of teamA) {
    for (const b of teamB) {
      opponentHistory.get(a)!.add(b);
      opponentHistory.get(b)!.add(a);
    }
  }
}

export function generatePopcornSchedule(
  playerIds: string[],
  numRounds: number,
  rng: () => number = Math.random
): PopcornPairing[] {
  if (playerIds.length < 4) {
    throw new Error('Popcorn requires at least 4 players');
  }

  const sitOutCounts = new Map<string, number>(playerIds.map((id) => [id, 0]));
  const partnerHistory = new Map<string, Set<string>>(playerIds.map((id) => [id, new Set<string>()]));
  const opponentHistory = new Map<string, Set<string>>(playerIds.map((id) => [id, new Set<string>()]));
  const pairings: PopcornPairing[] = [];

  const sitOutsPerRound = playerIds.length % 4;

  for (let round = 1; round <= numRounds; round++) {
    const candidatesForSitOut = shuffle(playerIds, rng).sort(
      (a, b) => sitOutCounts.get(a)! - sitOutCounts.get(b)!
    );
    const sittingOut = new Set(candidatesForSitOut.slice(0, sitOutsPerRound));
    for (const id of sittingOut) {
      sitOutCounts.set(id, sitOutCounts.get(id)! + 1);
    }

    let active = shuffle(
      playerIds.filter((id) => !sittingOut.has(id)),
      rng
    );

    while (active.length > 0) {
      const anchor = active[0];
      const rest = active.slice(1);

      let bestGroup: string[] = active.slice(0, 4);
      let bestCost = Infinity;

      for (let i = 0; i < rest.length; i++) {
        for (let j = i + 1; j < rest.length; j++) {
          for (let k = j + 1; k < rest.length; k++) {
            const group = [anchor, rest[i], rest[j], rest[k]];
            const cost = groupCost(group, partnerHistory, opponentHistory);
            if (cost < bestCost) {
              bestCost = cost;
              bestGroup = group;
            }
          }
        }
      }

      const [p1, p2, p3, p4] = bestGroup;
      const splits: Array<[[string, string], [string, string]]> = [
        [[p1, p2], [p3, p4]],
        [[p1, p3], [p2, p4]],
        [[p1, p4], [p2, p3]],
      ];

      let bestSplit = splits[0];
      let bestSplitCost = Infinity;
      for (const split of splits) {
        const cost = splitCost(split[0], split[1], partnerHistory);
        if (cost < bestSplitCost) {
          bestSplitCost = cost;
          bestSplit = split;
        }
      }

      const [teamA, teamB] = bestSplit;
      pairings.push({ round, teamAPlayerIds: teamA, teamBPlayerIds: teamB });
      recordHistory(teamA, teamB, partnerHistory, opponentHistory);

      active = active.filter((id) => !bestGroup.includes(id));
    }
  }

  return pairings;
}
