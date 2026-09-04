// apps/organizer-web/lib/stats/rankWithTies.ts

/**
 * Dense ranking (1, 2, 2, 3): assigns rank numbers over an already-sorted array
 * so that consecutive entries with an identical key share the same rank, and the
 * next distinct entry's rank is simply the previous rank + 1 -- never skipping a
 * number. Two people tied for 1st both show as 1st; whoever comes right after them
 * is 2nd, not 3rd, because rank numbers never skip regardless of how many people
 * share a rank above them.
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
    if (i === 0) {
      currentRank = 1;
    } else if (key !== previousKey) {
      currentRank = currentRank + 1;
    }
    previousKey = key;
    return { ...row, rank: currentRank };
  });
}
