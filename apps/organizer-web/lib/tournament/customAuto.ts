import type { CustomAutoTeam, CustomAutoMatch, CustomAutoPairing } from '@/lib/types';

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

// Full round-robin coverage (everyone plays everyone exactly once) needs teamCount
// rounds when teamCount is odd (one bye per round, rotating), or teamCount - 1 rounds
// when even (nobody ever sits out). Informational only -- never enforced.
export function customFullCoverageRounds(teamCount: number): number {
  if (teamCount < 2) return 0;
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

// Computes a fair pairing for `targetRound`, given the tournament's current teams and
// every match that exists so far (any round, whether it was added manually or by a
// previous call to this function). Stateless and deterministic: recomputes sit-out
// counts and meeting history fresh from `existingMatches` every time, which is what
// makes manual/auto interleaving work correctly -- a team the organizer left unpaired
// in a manual round is picked up here as having sat out, same as if this function had
// generated that round itself.
export function computeCustomAutoRound(
  teams: CustomAutoTeam[],
  existingMatches: CustomAutoMatch[],
  targetRound: number
): CustomAutoPairing[] {
  if (teams.length < 2) {
    throw new Error('Custom auto-generate requires at least 2 teams');
  }

  // 1. Sit-out counts: how many rounds strictly before targetRound (among rounds that
  // actually have at least one match recorded) each team was absent from.
  const priorRounds = new Set(
    existingMatches.filter((m) => m.round < targetRound).map((m) => m.round)
  );
  const sitOutCounts = new Map<string, number>(teams.map((t) => [t.id, 0]));
  for (const round of priorRounds) {
    const activeThisRound = new Set(
      existingMatches
        .filter((m) => m.round === round)
        .flatMap((m) => [m.teamAId, m.teamBId])
    );
    for (const t of teams) {
      if (!activeThisRound.has(t.id)) {
        sitOutCounts.set(t.id, (sitOutCounts.get(t.id) ?? 0) + 1);
      }
    }
  }

  // 2. Choose this round's sit-out(s): teams.length % 2 teams, fewest sit-outs first,
  // ties broken by input-array order (stable, no randomness).
  const numSitOut = teams.length % 2;
  const byFairness = [...teams].sort((a, b) => {
    const diff = (sitOutCounts.get(a.id) ?? 0) - (sitOutCounts.get(b.id) ?? 0);
    if (diff !== 0) return diff;
    return teams.indexOf(a) - teams.indexOf(b);
  });
  const sittingOutIds = new Set(byFairness.slice(0, numSitOut).map((t) => t.id));
  const active = teams.filter((t) => !sittingOutIds.has(t.id));

  // 3. Meeting history: how many times each pair has met, and the highest round number
  // they last met in (used for the least-recently-played rematch fallback).
  const meetingCount = new Map<string, number>();
  const lastMetRound = new Map<string, number>();
  for (const m of existingMatches) {
    const key = pairKey(m.teamAId, m.teamBId);
    meetingCount.set(key, (meetingCount.get(key) ?? 0) + 1);
    lastMetRound.set(key, Math.max(lastMetRound.get(key) ?? 0, m.round));
  }

  // 4. Greedy pairing, processed in input-array order: take the first unpaired team,
  // pair it with whichever remaining team it has met the fewest times (0 = never met,
  // sorts first), ties broken by least-recently-met, ties broken by array order (the
  // `<` comparisons below only update on strict improvement, so the first candidate in
  // `remaining` wins any full tie automatically).
  const remaining = [...active];
  const pairings: CustomAutoPairing[] = [];
  while (remaining.length > 0) {
    const teamA = remaining.shift()!;
    let bestIndex = 0;
    let bestMeetings = Infinity;
    let bestLastMet = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const key = pairKey(teamA.id, remaining[i].id);
      const meetings = meetingCount.get(key) ?? 0;
      const lastMet = lastMetRound.get(key) ?? 0;
      if (meetings < bestMeetings || (meetings === bestMeetings && lastMet < bestLastMet)) {
        bestIndex = i;
        bestMeetings = meetings;
        bestLastMet = lastMet;
      }
    }
    const teamB = remaining.splice(bestIndex, 1)[0];
    pairings.push({ teamAId: teamA.id, teamBId: teamB.id });
  }

  return pairings;
}
