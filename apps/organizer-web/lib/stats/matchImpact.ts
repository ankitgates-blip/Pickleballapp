import type { PersonMatchRecord } from './types';

export type MatchImpact =
  | { kind: 'streak'; length: number }
  | { kind: 'upset' }
  | { kind: 'tough-loss' }
  | null;

// Per-match "what this result meant" badge, for a DUPR-style match-impact display
// on match history rows. `matches` must be most-recent-first (the same order
// computePersonStats returns matchHistory in) -- the result is a parallel array,
// one entry per match, in that same order.
//
// Priority per match: a win that's part of an active streak of 2+ always wins
// (it's the more exciting story); otherwise a win or loss against a
// higher-rated opponent (by current overall win percentage, same convention as
// winsVsHigherRated) is flagged as an upset or a tough loss; anything else gets
// no badge.
export function buildMatchImpacts(
  matches: PersonMatchRecord[],
  ownWinPercentage: number,
  winPercentageByPersonId: Map<string, number | null>
): MatchImpact[] {
  // Walk oldest -> newest to compute the win-streak length as of each match,
  // then map that back onto the most-recent-first order the caller uses.
  let current = 0;
  const streakByIndexChronological: number[] = [];
  for (let i = matches.length - 1; i >= 0; i--) {
    current = matches[i].won ? current + 1 : 0;
    streakByIndexChronological.push(current);
  }
  const streakByIndex = [...streakByIndexChronological].reverse();

  return matches.map((m, i) => {
    if (m.won && streakByIndex[i] >= 2) {
      return { kind: 'streak', length: streakByIndex[i] };
    }

    const [opponentA, opponentB] = m.opponentIds;
    const pctA = winPercentageByPersonId.get(opponentA) ?? 0;
    const pctB = winPercentageByPersonId.get(opponentB) ?? 0;
    const opponentAveragePercentage = (pctA + pctB) / 2;

    if (opponentAveragePercentage > ownWinPercentage) {
      return m.won ? { kind: 'upset' } : { kind: 'tough-loss' };
    }

    return null;
  });
}
