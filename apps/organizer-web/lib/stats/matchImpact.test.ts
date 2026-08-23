import { describe, it, expect } from 'vitest';
import { buildMatchImpacts } from './matchImpact';
import type { PersonMatchRecord } from './types';

function record(overrides: Partial<PersonMatchRecord>): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-01-01',
    venueName: 'Pickleturf',
    partnerId: 'partner',
    opponentIds: ['opp-a', 'opp-b'],
    scoreFor: 11,
    scoreAgainst: 5,
    won: true,
    ...overrides,
  };
}

describe('buildMatchImpacts', () => {
  it('flags a win as a streak once it is the 2nd+ consecutive win, most-recent-first order', () => {
    // Chronologically: win, win, win (oldest to newest) -> most-recent-first: [win(3), win(2), win(1)]
    const matches = [
      record({ tournamentDate: '2026-01-03' }),
      record({ tournamentDate: '2026-01-02' }),
      record({ tournamentDate: '2026-01-01' }),
    ];
    const result = buildMatchImpacts(matches, 50, new Map());
    expect(result).toEqual([
      { kind: 'streak', length: 3 },
      { kind: 'streak', length: 2 },
      null, // first win of the streak -- not yet a "streak" (length 1)
    ]);
  });

  it('resets the streak after a loss', () => {
    const matches = [
      record({ tournamentDate: '2026-01-03', won: true }), // most recent
      record({ tournamentDate: '2026-01-02', won: false }),
      record({ tournamentDate: '2026-01-01', won: true }),
    ];
    const result = buildMatchImpacts(matches, 50, new Map());
    expect(result).toEqual([null, null, null]);
  });

  it('flags a win against a higher-rated opponent as an upset when not part of a streak', () => {
    const matches = [record({ won: true, opponentIds: ['opp-a', 'opp-b'] })];
    const winPercentageByPersonId = new Map([
      ['opp-a', 80],
      ['opp-b', 80],
    ]);
    const result = buildMatchImpacts(matches, 40, winPercentageByPersonId);
    expect(result).toEqual([{ kind: 'upset' }]);
  });

  it('flags a loss against a higher-rated opponent as a tough loss', () => {
    const matches = [record({ won: false, opponentIds: ['opp-a', 'opp-b'] })];
    const winPercentageByPersonId = new Map([
      ['opp-a', 80],
      ['opp-b', 80],
    ]);
    const result = buildMatchImpacts(matches, 40, winPercentageByPersonId);
    expect(result).toEqual([{ kind: 'tough-loss' }]);
  });

  it('returns null when the opponent is not higher-rated and there is no streak', () => {
    const matches = [record({ won: false, opponentIds: ['opp-a', 'opp-b'] })];
    const winPercentageByPersonId = new Map([
      ['opp-a', 20],
      ['opp-b', 20],
    ]);
    const result = buildMatchImpacts(matches, 40, winPercentageByPersonId);
    expect(result).toEqual([null]);
  });

  it('prioritizes an active streak over an upset badge on the same match', () => {
    const matches = [
      record({ tournamentDate: '2026-01-02', won: true, opponentIds: ['opp-a', 'opp-b'] }),
      record({ tournamentDate: '2026-01-01', won: true, opponentIds: ['opp-a', 'opp-b'] }),
    ];
    const winPercentageByPersonId = new Map([
      ['opp-a', 90],
      ['opp-b', 90],
    ]);
    const result = buildMatchImpacts(matches, 40, winPercentageByPersonId);
    expect(result[0]).toEqual({ kind: 'streak', length: 2 });
  });

  it('treats a missing win-percentage entry as 0', () => {
    const matches = [record({ won: false, opponentIds: ['unknown-a', 'unknown-b'] })];
    const result = buildMatchImpacts(matches, 10, new Map());
    expect(result).toEqual([null]);
  });
});
