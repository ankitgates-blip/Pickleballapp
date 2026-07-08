import { describe, it, expect } from 'vitest';
import { generateRoundRobin } from './roundRobin';

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
});
