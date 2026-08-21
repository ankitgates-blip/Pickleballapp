import { describe, it, expect } from 'vitest';
import { generateSemifinals, pickFinalists } from './playoffs';
import type { StandingsRow } from '@/lib/types';

function row(teamId: string): StandingsRow {
  return { teamId, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
}

describe('generateSemifinals', () => {
  it('pairs 1st vs 4th and 2nd vs 3rd', () => {
    const standings = [row('a'), row('b'), row('c'), row('d')];
    const result = generateSemifinals(standings);
    expect(result).toEqual([
      { teamAId: 'a', teamBId: 'd' },
      { teamAId: 'b', teamBId: 'c' },
    ]);
  });

  it('only uses the top 4 when more are passed', () => {
    const standings = [row('a'), row('b'), row('c'), row('d'), row('e')];
    const result = generateSemifinals(standings);
    expect(result).toEqual([
      { teamAId: 'a', teamBId: 'd' },
      { teamAId: 'b', teamBId: 'c' },
    ]);
  });

  it('throws when fewer than 4 teams are passed', () => {
    const standings = [row('a'), row('b'), row('c')];
    expect(() => generateSemifinals(standings)).toThrow();
  });
});

describe('pickFinalists', () => {
  it('pairs 1st vs 2nd', () => {
    const standings = [row('a'), row('b'), row('c'), row('d')];
    const result = pickFinalists(standings);
    expect(result).toEqual({ teamAId: 'a', teamBId: 'b' });
  });

  it('only uses the top 2 when more are passed', () => {
    const standings = [row('a'), row('b'), row('c'), row('d'), row('e')];
    const result = pickFinalists(standings);
    expect(result).toEqual({ teamAId: 'a', teamBId: 'b' });
  });

  it('throws when fewer than 2 teams are passed', () => {
    const standings = [row('a')];
    expect(() => pickFinalists(standings)).toThrow();
  });
});
