import type { PersonMatchRecord } from './types';

export function winsVsHigherRated(
  matches: PersonMatchRecord[],
  ownWinPercentage: number,
  winPercentageByPersonId: Map<string, number | null>
): number {
  let count = 0;
  for (const m of matches) {
    if (!m.won) continue;
    const [opponentA, opponentB] = m.opponentIds;
    const pctA = winPercentageByPersonId.get(opponentA) ?? 0;
    const pctB = winPercentageByPersonId.get(opponentB) ?? 0;
    const opponentAveragePercentage = (pctA + pctB) / 2;
    if (opponentAveragePercentage > ownWinPercentage) {
      count += 1;
    }
  }
  return count;
}
