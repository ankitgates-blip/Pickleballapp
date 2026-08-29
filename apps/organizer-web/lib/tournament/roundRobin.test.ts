import { describe, it, expect } from 'vitest';
import {
  generateRoundRobin,
  generateDoubleHeaderRoundRobin,
  generateMultiCycleRoundRobin,
} from './roundRobin';

describe('generateRoundRobin', () => {
  it('throws with fewer than 2 teams', () => {
    expect(() => generateRoundRobin(['a'])).toThrow();
  });

  it('pairs every team with every other exactly once for an even count', () => {
    const pairings = generateRoundRobin(['A', 'B', 'C', 'D']);

    expect(pairings).toHaveLength(6); // C(4,2)
    expect(pairings.every((p) => p.teamBId !== null)).toBe(true);

    const seen = new Set(
      pairings.map((p) => [p.teamAId, p.teamBId].sort().join('-'))
    );
    expect(seen.size).toBe(6);
  });

  it('gives each team exactly one bye for an odd count', () => {
    const pairings = generateRoundRobin(['A', 'B', 'C']);

    const byes = pairings.filter((p) => p.teamBId === null);
    expect(byes).toHaveLength(3);
    expect(new Set(byes.map((b) => b.teamAId)).size).toBe(3);

    const realMatches = pairings.filter((p) => p.teamBId !== null);
    expect(realMatches).toHaveLength(3); // C(3,2)
  });

  it('guarantees every team plays teamCount - 1 real matches (8 teams -> 7, 9 teams -> 8)', () => {
    const eightTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const eightPairings = generateRoundRobin(eightTeams);
    const eightRounds = new Set(eightPairings.map((p) => p.round)).size;
    expect(eightRounds).toBe(7);
    for (const team of eightTeams) {
      const realMatches = eightPairings.filter(
        (p) => p.teamBId !== null && (p.teamAId === team || p.teamBId === team)
      );
      expect(realMatches).toHaveLength(7);
    }

    const nineTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const ninePairings = generateRoundRobin(nineTeams);
    for (const team of nineTeams) {
      const realMatches = ninePairings.filter(
        (p) => p.teamBId !== null && (p.teamAId === team || p.teamBId === team)
      );
      expect(realMatches).toHaveLength(8);
    }
  });
});

describe('generateDoubleHeaderRoundRobin', () => {
  it('doubles every real matchup, keeping the same round number', () => {
    const single = generateRoundRobin(['A', 'B', 'C', 'D']);
    const doubled = generateDoubleHeaderRoundRobin(['A', 'B', 'C', 'D']);

    expect(doubled).toHaveLength(single.length * 2);

    for (const pairing of single) {
      const matches = doubled.filter(
        (p) =>
          p.round === pairing.round &&
          p.teamAId === pairing.teamAId &&
          p.teamBId === pairing.teamBId
      );
      expect(matches).toHaveLength(2);
    }
  });

  it('does not double byes for an odd team count', () => {
    const single = generateRoundRobin(['A', 'B', 'C']);
    const doubled = generateDoubleHeaderRoundRobin(['A', 'B', 'C']);

    const singleByes = single.filter((p) => p.teamBId === null);
    const doubledByes = doubled.filter((p) => p.teamBId === null);
    expect(doubledByes).toHaveLength(singleByes.length);

    const singleReal = single.filter((p) => p.teamBId !== null);
    const doubledReal = doubled.filter((p) => p.teamBId !== null);
    expect(doubledReal).toHaveLength(singleReal.length * 2);
  });
});

describe('generateMultiCycleRoundRobin', () => {
  it('matches a plain single-cycle round robin when targetRounds is within one cycle', () => {
    const single = generateRoundRobin(['A', 'B', 'C', 'D']).filter((p) => p.round <= 2);
    const multi = generateMultiCycleRoundRobin(['A', 'B', 'C', 'D'], 2);
    expect(multi).toEqual(single);
  });

  it('repeats the full cycle with round numbers continuing on from the first', () => {
    const single = generateRoundRobin(['A', 'B', 'C', 'D']); // 3 rounds for 4 teams
    const multi = generateMultiCycleRoundRobin(['A', 'B', 'C', 'D'], 6); // exactly 2 cycles

    expect(multi).toHaveLength(single.length * 2);
    const secondCycle = multi.filter((p) => p.round > 3);
    expect(secondCycle).toHaveLength(single.length);
    for (const pairing of single) {
      const repeat = secondCycle.find(
        (p) => p.round === pairing.round + 3 && p.teamAId === pairing.teamAId && p.teamBId === pairing.teamBId
      );
      expect(repeat).toBeDefined();
    }
  });

  it('trims the final cycle down to exactly targetRounds when it only partially repeats', () => {
    const multi = generateMultiCycleRoundRobin(['A', 'B', 'C', 'D'], 4); // 1 full cycle (3) + 1 round
    expect(Math.max(...multi.map((p) => p.round))).toBe(4);
    expect(multi.every((p) => p.round <= 4)).toBe(true);
  });

  it('preserves the same bye rotation on every repeated cycle for an odd team count', () => {
    const multi = generateMultiCycleRoundRobin(['A', 'B', 'C'], 6); // 2 cycles of 3 rounds
    const byesByRound = new Map<number, string>();
    for (const p of multi.filter((p) => p.teamBId === null)) {
      byesByRound.set(p.round, p.teamAId);
    }
    expect(byesByRound.get(1)).toBe(byesByRound.get(4));
    expect(byesByRound.get(2)).toBe(byesByRound.get(5));
    expect(byesByRound.get(3)).toBe(byesByRound.get(6));
  });
});
