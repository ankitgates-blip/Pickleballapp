import { describe, it, expect } from 'vitest';
import { computeCustomDynamicRound } from './customDynamic';
import type { PlayerHistory } from './customPlayerHistory';

function emptyHistory(playerIds: string[]): PlayerHistory {
  return {
    sitOutCounts: new Map(playerIds.map((id) => [id, 0])),
    partnerCounts: new Map(),
    opponentCounts: new Map(),
    lastMetRound: new Map(),
  };
}

describe('computeCustomDynamicRound', () => {
  it('throws with fewer than 4 players', () => {
    expect(() => computeCustomDynamicRound(['a', 'b', 'c'], emptyHistory(['a', 'b', 'c']))).toThrow();
  });

  it('pairs exactly 4 players into 1 match with nobody sitting out', () => {
    const players = ['a', 'b', 'c', 'd'];
    const pairings = computeCustomDynamicRound(players, emptyHistory(players));
    expect(pairings).toHaveLength(1);
    const allPlayers = pairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]);
    expect(new Set(allPlayers).size).toBe(4);
  });

  it('sits out exactly playerIds.length % 4 players, prioritizing fewest sit-outs', () => {
    const players = ['a', 'b', 'c', 'd', 'e'];
    const history = emptyHistory(players);
    history.sitOutCounts.set('a', 3); // a has sat out the most -- should NOT be picked to sit out again
    history.sitOutCounts.set('b', 0);

    const pairings = computeCustomDynamicRound(players, history);
    const playing = new Set(pairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]));
    expect(playing.size).toBe(4);
    expect(playing.has('a')).toBe(true); // a played -- b (fewest sit-outs) sat out instead
    expect(playing.has('b')).toBe(false);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const history = emptyHistory(players);
    const run1 = computeCustomDynamicRound(players, history);
    const run2 = computeCustomDynamicRound(players, history);
    expect(run1).toEqual(run2);
  });

  it('prefers pairing players who have not yet partnered over those who have', () => {
    const players = ['a', 'b', 'c', 'd'];
    const history = emptyHistory(players);
    // a+b and c+d have already partnered twice; a+c/b+d and a+d/b+c have never met.
    history.partnerCounts.set(['a', 'b'].sort().join('::'), 2);
    history.partnerCounts.set(['c', 'd'].sort().join('::'), 2);

    const pairings = computeCustomDynamicRound(players, history);
    expect(pairings).toHaveLength(1);
    const [pairing] = pairings;
    const teamA = new Set(pairing.teamAPlayerIds);
    // a and b must NOT be teamed together again when an unpaired-before split exists.
    expect(teamA.has('a') && teamA.has('b')).toBe(false);
  });
});
