import type { PersonMatchRecord } from './types';

export function currentWinStreak(mostRecentFirst: PersonMatchRecord[]): number {
  let streak = 0;
  for (const record of mostRecentFirst) {
    if (!record.won) break;
    streak += 1;
  }
  return streak;
}
