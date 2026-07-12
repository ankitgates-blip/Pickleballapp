import { describe, it, expect } from 'vitest';
import { generatePopcornSchedule } from './popcorn';

describe('generatePopcornSchedule', () => {
  it('throws with fewer than 4 players', () => {
    expect(() => generatePopcornSchedule(['a', 'b', 'c'], 3)).toThrow();
  });

  it('gives every player exactly one match per round when count is a multiple of 4', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const pairings = generatePopcornSchedule(players, 3);

    expect(pairings).toHaveLength(3 * 2); // 8 players / 4 per court = 2 courts per round, 3 rounds

    for (let round = 1; round <= 3; round++) {
      const roundPairings = pairings.filter((p) => p.round === round);
      const playersInRound = roundPairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]);
      expect(new Set(playersInRound).size).toBe(8); // every player appears exactly once
      expect(playersInRound).toHaveLength(8);
    }
  });

  it('rotates sit-outs fairly when player count is not a multiple of 4', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']; // 10 players, 2 sit out per round
    const numRounds = 8;
    const pairings = generatePopcornSchedule(players, numRounds);

    const sitOutCounts = new Map<string, number>(players.map((p) => [p, 0]));
    for (let round = 1; round <= numRounds; round++) {
      const roundPairings = pairings.filter((p) => p.round === round);
      const playing = new Set(roundPairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]));
      expect(playing.size).toBe(8); // 10 - 2 sitting out
      for (const player of players) {
        if (!playing.has(player)) {
          sitOutCounts.set(player, sitOutCounts.get(player)! + 1);
        }
      }
    }

    // 2 sit-out slots x 8 rounds = 16 total sit-outs across 10 players -> expect roughly 1-2 each
    const counts = [...sitOutCounts.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('never puts a player against or with themselves, and every match has 4 distinct players', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const pairings = generatePopcornSchedule(players, 5);

    for (const p of pairings) {
      const allFour = [...p.teamAPlayerIds, ...p.teamBPlayerIds];
      expect(new Set(allFour).size).toBe(4);
    }
  });

  it('rotates the 2v2 split for a fixed group of exactly 4 players before repeating', () => {
    const players = ['A', 'B', 'C', 'D'];
    const pairings = generatePopcornSchedule(players, 3);

    expect(pairings).toHaveLength(3);

    const splitKeys = pairings.map((p) =>
      [p.teamAPlayerIds, p.teamBPlayerIds].map((team) => [...team].sort().join('-')).sort().join('|')
    );
    expect(new Set(splitKeys).size).toBe(3); // all 3 possible splits used, none repeated across 3 rounds
  });
});
