import { describe, it, expect } from 'vitest';
import { winsVsHigherRated } from './winsVsHigherRated';
import type { PersonMatchRecord } from './types';

function win(opponentIds: [string, string]): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-01-01',
    venueName: 'Pickle Turf',
    partnerId: 'p1',
    opponentIds,
    scoreFor: 11,
    scoreAgainst: 5,
    won: true,
  };
}

function loss(opponentIds: [string, string]): PersonMatchRecord {
  return {
    tournamentId: 't1',
    tournamentDate: '2026-01-01',
    venueName: 'Pickle Turf',
    partnerId: 'p1',
    opponentIds,
    scoreFor: 5,
    scoreAgainst: 11,
    won: false,
  };
}

describe('winsVsHigherRated', () => {
  it("counts a win when the opponent side's average win % is higher", () => {
    const history = [win(['a', 'b'])];
    const winPercentageByPersonId = new Map([
      ['a', 80],
      ['b', 70],
    ]);
    expect(winsVsHigherRated(history, 50, winPercentageByPersonId)).toBe(1);
  });

  it('does not count a win when the opponent side is not higher-rated', () => {
    const history = [win(['a', 'b'])];
    const winPercentageByPersonId = new Map([
      ['a', 30],
      ['b', 20],
    ]);
    expect(winsVsHigherRated(history, 50, winPercentageByPersonId)).toBe(0);
  });

  it('ignores losses even against higher-rated opponents', () => {
    const history = [loss(['a', 'b'])];
    const winPercentageByPersonId = new Map([
      ['a', 90],
      ['b', 90],
    ]);
    expect(winsVsHigherRated(history, 50, winPercentageByPersonId)).toBe(0);
  });

  it('treats a missing win percentage as 0', () => {
    const history = [win(['unknown', 'b'])];
    const winPercentageByPersonId = new Map([['b', 90]]);
    // average of (0 + 90) / 2 = 45, less than own 50 -> not counted
    expect(winsVsHigherRated(history, 50, winPercentageByPersonId)).toBe(0);
  });
});
