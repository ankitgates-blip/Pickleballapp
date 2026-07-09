import { describe, it, expect } from 'vitest';
import { shuffleIntoTeams } from './shuffle';

describe('shuffleIntoTeams', () => {
  it('pairs every id exactly once for an even count, using a fixed rng', () => {
    const teams = shuffleIntoTeams(['A', 'B', 'C', 'D'], () => 0);
    expect(teams).toEqual([
      { player1Id: 'B', player2Id: 'C' },
      { player1Id: 'D', player2Id: 'A' },
    ]);
  });

  it('leaves exactly one id unpaired for an odd count, using a fixed rng', () => {
    const teams = shuffleIntoTeams(['A', 'B', 'C', 'D', 'E'], () => 0);
    expect(teams).toEqual([
      { player1Id: 'B', player2Id: 'C' },
      { player1Id: 'D', player2Id: 'E' },
    ]);
    const used = teams.flatMap((t) => [t.player1Id, t.player2Id]);
    expect(used).not.toContain('A');
  });

  it('never pairs a player with themself', () => {
    const teams = shuffleIntoTeams(['a', 'b', 'c', 'd']);
    teams.forEach((t) => expect(t.player1Id).not.toBe(t.player2Id));
  });

  it('uses every input id at most once across all teams, with default randomness', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const teams = shuffleIntoTeams(ids);
    const used = teams.flatMap((t) => [t.player1Id, t.player2Id]);
    expect(new Set(used).size).toBe(used.length);
    expect(used.every((id) => ids.includes(id))).toBe(true);
    expect(teams.length).toBe(3); // floor(7 / 2)
  });
});
