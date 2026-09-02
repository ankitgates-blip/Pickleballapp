// apps/organizer-web/lib/stats/rankWithTies.ts

/**
 * Standard "competition ranking" (1, 2, 2, 4): assigns rank numbers over an
 * already-sorted array so that consecutive entries with an identical key share the
 * same rank, and the next distinct entry's rank is its 1-based array index -- not the
 * previous rank + 1. Two people tied for 1st both show as 1st; whoever comes right
 * after them is 3rd, not 2nd, because there are two people ahead of them, not one.
 *
 * `sortedRows` must already be in the order you want displayed -- this only decides
 * which adjacent rows count as tied, never reorders anything. `keyFor` should return
 * a string built from every stat that must match for two rows to be considered truly
 * tied (e.g. wins, matches played, points, league wins together) -- rows that are
 * merely adjacent after sorting but differ on any of those fields still get distinct
 * ranks.
 */
export function assignRanksWithTies<T>(
  sortedRows: readonly T[],
  keyFor: (row: T) => string
): (T & { rank: number })[] {
  let currentRank = 1;
  let previousKey: string | null = null;

  return sortedRows.map((row, i) => {
    const key = keyFor(row);
    if (i === 0 || key !== previousKey) {
      currentRank = i + 1;
    }
    previousKey = key;
    return { ...row, rank: currentRank };
  });
}
