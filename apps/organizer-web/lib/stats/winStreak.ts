import type { PersonMatchRecord } from './types';

// The longest run of consecutive wins ever achieved, across all completed matches
// -- a personal best, not the current streak. A loss ends the *current* run but
// never lowers the recorded best; the best only ever goes up, when a later run
// beats it. Order doesn't matter (most-recent-first or chronological give the
// same result), since the longest run of consecutive wins is direction-agnostic.
export function longestWinStreak(matches: PersonMatchRecord[]): number {
  let longest = 0;
  let current = 0;
  for (const record of matches) {
    if (record.won) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}
