import { describe, it, expect } from 'vitest';
import { assignRanksWithTies } from './rankWithTies';

type Row = { name: string; wins: number; points: number };

const keyFor = (r: Row) => `${r.wins}|${r.points}`;

describe('assignRanksWithTies', () => {
  it('assigns sequential ranks when nothing is tied', () => {
    const rows: Row[] = [
      { name: 'a', wins: 5, points: 50 },
      { name: 'b', wins: 4, points: 40 },
      { name: 'c', wins: 3, points: 30 },
    ];
    const result = assignRanksWithTies(rows, keyFor);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('gives two tied leaders the same rank, then skips to 3rd for whoever is next', () => {
    const rows: Row[] = [
      { name: 'a', wins: 5, points: 50 },
      { name: 'b', wins: 5, points: 50 },
      { name: 'c', wins: 3, points: 30 },
    ];
    const result = assignRanksWithTies(rows, keyFor);
    expect(result.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('handles a tie in the middle of the list', () => {
    const rows: Row[] = [
      { name: 'a', wins: 10, points: 100 },
      { name: 'b', wins: 5, points: 50 },
      { name: 'c', wins: 5, points: 50 },
      { name: 'd', wins: 5, points: 50 },
      { name: 'e', wins: 1, points: 10 },
    ];
    const result = assignRanksWithTies(rows, keyFor);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 2, 2, 5]);
  });

  it('does not tie two rows that are adjacent but differ on the key', () => {
    // Same wins, but different points -- must NOT be treated as tied.
    const rows: Row[] = [
      { name: 'a', wins: 5, points: 60 },
      { name: 'b', wins: 5, points: 50 },
    ];
    const result = assignRanksWithTies(rows, keyFor);
    expect(result.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('ties everyone when the whole list is identical', () => {
    const rows: Row[] = [
      { name: 'a', wins: 5, points: 50 },
      { name: 'b', wins: 5, points: 50 },
      { name: 'c', wins: 5, points: 50 },
    ];
    const result = assignRanksWithTies(rows, keyFor);
    expect(result.map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it('preserves every other field on each row unchanged', () => {
    const rows: Row[] = [{ name: 'a', wins: 5, points: 50 }];
    const result = assignRanksWithTies(rows, keyFor);
    expect(result[0]).toMatchObject({ name: 'a', wins: 5, points: 50, rank: 1 });
  });

  it('returns an empty array for empty input', () => {
    expect(assignRanksWithTies([], keyFor)).toEqual([]);
  });
});
