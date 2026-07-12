import { describe, it, expect } from 'vitest';
import { generateGauntletRound } from './gauntlet';
import type { GauntletRoundResult } from '@/lib/types';

describe('generateGauntletRound', () => {
  it('throws with fewer than 4 players', () => {
    expect(() => generateGauntletRound(['a', 'b', 'c'], [])).toThrow();
  });

  it('produces valid foursomes for round 1 with no prior results', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const pairings = generateGauntletRound(players, []);

    expect(pairings).toHaveLength(2); // 8 players / 4 per court

    const allPlayersInRound = pairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]);
    expect(new Set(allPlayersInRound).size).toBe(8);
    expect(allPlayersInRound).toHaveLength(8);

    for (const p of pairings) {
      const four = [...p.teamAPlayerIds, ...p.teamBPlayerIds];
      expect(new Set(four).size).toBe(4);
    }
  });

  it('groups winners with winners and losers with losers based on prior round results', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const previousRounds: GauntletRoundResult[] = [
      { round: 1, teamAPlayerIds: ['A', 'B'], teamBPlayerIds: ['C', 'D'], scoreA: 11, scoreB: 0 },
      { round: 1, teamAPlayerIds: ['E', 'F'], teamBPlayerIds: ['G', 'H'], scoreA: 11, scoreB: 0 },
    ];

    const pairings = generateGauntletRound(players, previousRounds);
    const winners = new Set(['A', 'B', 'E', 'F']);
    const losers = new Set(['C', 'D', 'G', 'H']);

    for (const p of pairings) {
      const four = [...p.teamAPlayerIds, ...p.teamBPlayerIds];
      const allWinners = four.every((id) => winners.has(id));
      const allLosers = four.every((id) => losers.has(id));
      expect(allWinners || allLosers).toBe(true);
    }
  });

  it('splits a ranked foursome as rank1+rank4 vs rank2+rank3', () => {
    // Construct a strict, tie-free rank order: P1 (2W, +16) > P2 (1W, +4) > P3 (1W, -4) > P4 (0W, -16)
    const previousRounds: GauntletRoundResult[] = [
      { round: 1, teamAPlayerIds: ['P1', 'P2'], teamBPlayerIds: ['P3', 'P4'], scoreA: 11, scoreB: 1 },
      { round: 2, teamAPlayerIds: ['P1', 'P3'], teamBPlayerIds: ['P2', 'P4'], scoreA: 11, scoreB: 5 },
    ];

    const pairings = generateGauntletRound(['P1', 'P2', 'P3', 'P4'], previousRounds);

    expect(pairings).toHaveLength(1);
    expect(pairings[0].teamAPlayerIds).toEqual(['P1', 'P4']);
    expect(pairings[0].teamBPlayerIds).toEqual(['P2', 'P3']);
  });

  it('rotates sit-outs fairly across many simulated rounds', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']; // 10 players, 2 sit out per round
    let previousRounds: GauntletRoundResult[] = [];
    const sitOutCounts = new Map(players.map((p) => [p, 0]));

    for (let round = 1; round <= 8; round++) {
      const pairings = generateGauntletRound(players, previousRounds);
      const playing = new Set(pairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]));
      expect(playing.size).toBe(8); // 10 - 2 sitting out

      for (const p of players) {
        if (!playing.has(p)) sitOutCounts.set(p, sitOutCounts.get(p)! + 1);
      }

      for (const pairing of pairings) {
        previousRounds.push({
          round,
          teamAPlayerIds: pairing.teamAPlayerIds,
          teamBPlayerIds: pairing.teamBPlayerIds,
          scoreA: 11,
          scoreB: 7,
        });
      }
    }

    const counts = [...sitOutCounts.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});
