import { describe, it, expect } from 'vitest';
import { generateRoundRobin, generateDoubleHeaderRoundRobin } from './roundRobin';

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
