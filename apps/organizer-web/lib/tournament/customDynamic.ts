import type { PlayerHistory } from './customPlayerHistory';

export type CustomDynamicPairing = {
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

function pairMeetingCost(a: string, b: string, history: PlayerHistory): number {
  const key = pairKey(a, b);
  const meetings = (history.partnerCounts.get(key) ?? 0) + (history.opponentCounts.get(key) ?? 0);
  const lastMet = history.lastMetRound.get(key) ?? 0;
  return meetings * 1_000_000 + lastMet;
}

function groupCost(group: string[], history: PlayerHistory): number {
  let cost = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      cost += pairMeetingCost(group[i], group[j], history);
    }
  }
  return cost;
}

function partnerMeetingCost(a: string, b: string, history: PlayerHistory): number {
  const key = pairKey(a, b);
  const partners = history.partnerCounts.get(key) ?? 0;
  const lastMet = history.lastMetRound.get(key) ?? 0;
  return partners * 1_000_000 + lastMet;
}

function splitCost(
  teamA: [string, string],
  teamB: [string, string],
  history: PlayerHistory
): number {
  return partnerMeetingCost(teamA[0], teamA[1], history) + partnerMeetingCost(teamB[0], teamB[1], history);
}

// Computes one round's pairings from a player-history snapshot (see customPlayerHistory.ts).
// Throws if fewer than 4 players are supplied -- a match needs 4 players, same floor as
// generateGauntletRound / generatePopcornSchedule. Sits out playerIds.length % 4 players
// (fewest sit-outs first, ties broken by input order -- deterministic, no randomness,
// matching computeCustomAutoRound's convention rather than popcorn.ts's shuffle-based one),
// then groups the rest into foursomes and splits each into two teams, minimizing repeat
// partners/opponents. Adapted from popcorn.ts's per-round grouping shape but reimplemented
// fresh for a single round with deterministic tie-breaking -- see
// docs/superpowers/specs/2026-08-25-custom-league-odd-player-pairing-design.md.
export function computeCustomDynamicRound(
  playerIds: string[],
  history: PlayerHistory
): CustomDynamicPairing[] {
  if (playerIds.length < 4) {
    throw new Error('Need at least 4 players for a Custom League dynamic round');
  }

  const sitOutsThisRound = playerIds.length % 4;
  const byFairness = [...playerIds].sort((a, b) => {
    const diff = (history.sitOutCounts.get(a) ?? 0) - (history.sitOutCounts.get(b) ?? 0);
    if (diff !== 0) return diff;
    return playerIds.indexOf(a) - playerIds.indexOf(b);
  });
  const sittingOutIds = new Set(byFairness.slice(0, sitOutsThisRound));
  let active = playerIds.filter((id) => !sittingOutIds.has(id));

  const pairings: CustomDynamicPairing[] = [];

  while (active.length > 0) {
    const anchor = active[0];
    const rest = active.slice(1);

    let bestGroup: string[] = active.slice(0, 4);
    let bestCost = Infinity;

    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        for (let k = j + 1; k < rest.length; k++) {
          const group = [anchor, rest[i], rest[j], rest[k]];
          const cost = groupCost(group, history);
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
      const cost = splitCost(split[0], split[1], history);
      if (cost < bestSplitCost) {
        bestSplitCost = cost;
        bestSplit = split;
      }
    }

    const [teamA, teamB] = bestSplit;
    pairings.push({ teamAPlayerIds: teamA, teamBPlayerIds: teamB });

    active = active.filter((id) => !bestGroup.includes(id));
  }

  return pairings;
}
