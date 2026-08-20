import type { PersonMatchRecord } from './types';

export function winPercentageFromRecords(records: PersonMatchRecord[]): number | null {
  if (records.length === 0) {
    return null;
  }
  const wins = records.filter((r) => r.won).length;
  return Math.round((wins / records.length) * 100);
}
