// Pickleturf has exactly 4 physical courts. This module is the "which physical court is
// this match played on" semantic -- distinct from claimTheThrone.ts / upAndDownTheRiver.ts,
// where the matches table's `court` column instead means ladder ranking tier for those two
// formats. See docs/superpowers/specs/2026-08-24-court-assignment-design.md.
export const NUM_COURTS = 4;

// 0-based index -> 1-based court number, cycling every numCourts. Used so a round with more
// matches than courts (e.g. 10 teams -> 5 simultaneous matches vs. 4 courts) wraps back to
// Court 1 instead of leaving overflow matches courtless.
export function courtForIndex(index: number, numCourts: number = NUM_COURTS): number {
  return (index % numCourts) + 1;
}

export function courtLabel(court: number): string {
  return court === 1 ? 'Centre Court' : `Court ${court}`;
}

// Attaches `court` to each row in array order via courtForIndex. Row order is the caller's
// play order for the round (whatever order the pairing array is already in).
export function assignCourts<T>(rows: T[]): (T & { court: number })[] {
  return rows.map((row, i) => ({ ...row, court: courtForIndex(i) }));
}

// Assigns courts within each round independently -- the index resets to 0 at the start of
// every round, instead of continuing across the whole array. Needed for generators that
// return one flat array spanning multiple rounds (round_robin, popcorn): without this,
// only the first round would start at Court 1, and later rounds would inherit whatever
// index the previous round left off at.
//
// Bye rows (wherever `isBye` returns true) are skipped entirely -- they don't consume a
// court slot, and get `court: null` since no match is actually played on them.
export function assignCourtsByRound<T extends { round: number }>(
  rows: T[],
  isBye: (row: T) => boolean = () => false
): (T & { court: number | null })[] {
  const countByRound = new Map<number, number>();
  return rows.map((row) => {
    if (isBye(row)) {
      return { ...row, court: null };
    }
    const index = countByRound.get(row.round) ?? 0;
    countByRound.set(row.round, index + 1);
    return { ...row, court: courtForIndex(index) };
  });
}
