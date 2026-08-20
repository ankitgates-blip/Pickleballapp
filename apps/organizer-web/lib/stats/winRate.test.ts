import { describe, it, expect } from 'vitest';
import { winPercentageFromRecords } from './winRate';
import type { PersonMatchRecord } from './types';

const record = (won: boolean): PersonMatchRecord => ({
  tournamentId: 't1',
  tournamentDate: '2026-01-01',
  venueName: 'Pickle Turf',
  partnerId: 'p2',
  opponentIds: ['p3', 'p4'],
  scoreFor: won ? 11 : 5,
  scoreAgainst: won ? 5 : 11,
  won,
});

describe('winPercentageFromRecords', () => {
  it('returns null when there are no records', () => {
    expect(winPercentageFromRecords([])).toBeNull();
  });

  it('returns 100 when every record is a win', () => {
    expect(winPercentageFromRecords([record(true), record(true)])).toBe(100);
  });

  it('returns 0 when every record is a loss', () => {
    expect(winPercentageFromRecords([record(false), record(false)])).toBe(0);
  });

  it('rounds to the nearest whole percent', () => {
    expect(winPercentageFromRecords([record(true), record(false), record(false)])).toBe(33);
  });
});
