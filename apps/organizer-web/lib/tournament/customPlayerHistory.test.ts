import { describe, it, expect } from 'vitest';
import { derivePlayerHistory } from './customPlayerHistory';

const teams = [
  { id: 't1', player1Id: 'a', player2Id: 'b' },
  { id: 't2', player1Id: 'c', player2Id: 'd' },
  { id: 't3', player1Id: 'e', player2Id: 'f' },
];

describe('derivePlayerHistory', () => {
  it('returns zeroed history when there are no matches', () => {
    const history = derivePlayerHistory(['a', 'b', 'c', 'd'], [], teams, 1);
    expect(history.sitOutCounts.get('a')).toBe(0);
    expect(history.sitOutCounts.get('d')).toBe(0);
    expect(history.partnerCounts.size).toBe(0);
    expect(history.opponentCounts.size).toBe(0);
    expect(history.lastMetRound.size).toBe(0);
  });

  it('expands a single match into partner and opponent counts for its 4 players', () => {
    const matches = [{ round: 1, teamAId: 't1', teamBId: 't2' }];
    const history = derivePlayerHistory(['a', 'b', 'c', 'd', 'e', 'f'], matches, teams, 2);

    expect(history.partnerCounts.get(['a', 'b'].sort().join('::'))).toBe(1);
    expect(history.partnerCounts.get(['c', 'd'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['a', 'c'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['a', 'd'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['b', 'c'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['b', 'd'].sort().join('::'))).toBe(1);
    expect(history.lastMetRound.get(['a', 'b'].sort().join('::'))).toBe(1);
  });

  it('counts players not on either team that round as sitting out', () => {
    const matches = [{ round: 1, teamAId: 't1', teamBId: 't2' }];
    const history = derivePlayerHistory(['a', 'b', 'c', 'd', 'e', 'f'], matches, teams, 2);

    expect(history.sitOutCounts.get('a')).toBe(0);
    expect(history.sitOutCounts.get('e')).toBe(1);
    expect(history.sitOutCounts.get('f')).toBe(1);
  });

  it('excludes rounds at or after beforeRound', () => {
    const matches = [
      { round: 1, teamAId: 't1', teamBId: 't2' },
      { round: 2, teamAId: 't1', teamBId: 't3' },
    ];
    const history = derivePlayerHistory(['a', 'b', 'c', 'd', 'e', 'f'], matches, teams, 2);

    // Only round 1 counted: round 2 (>= beforeRound) is excluded.
    expect(history.partnerCounts.get(['a', 'b'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['a', 'e'].sort().join('::'))).toBeUndefined();
    expect(history.sitOutCounts.get('e')).toBe(1); // sat out round 1 only
  });

  it('accumulates counts and tracks the most recent round across multiple matches', () => {
    const matches = [
      { round: 1, teamAId: 't1', teamBId: 't2' },
      { round: 2, teamAId: 't1', teamBId: 't2' },
    ];
    const history = derivePlayerHistory(['a', 'b', 'c', 'd', 'e', 'f'], matches, teams, 3);

    expect(history.partnerCounts.get(['a', 'b'].sort().join('::'))).toBe(2);
    expect(history.opponentCounts.get(['a', 'c'].sort().join('::'))).toBe(2);
    expect(history.lastMetRound.get(['a', 'b'].sort().join('::'))).toBe(2);
  });
});
