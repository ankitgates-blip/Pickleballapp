import type { PersonMatchRecord } from './types';

export function winsInLastN(mostRecentFirst: PersonMatchRecord[], n: number): number {
  return mostRecentFirst.slice(0, n).filter((r) => r.won).length;
}
