import { describe, it, expect } from 'vitest';
import { countPlayedMatches } from './matchesCount';

describe('countPlayedMatches', () => {
  it('counts complete two-team matches', () => {
    const matches = [
      { team_b_id: 'b1', status: 'complete' },
      { team_b_id: 'b2', status: 'complete' },
    ];
    expect(countPlayedMatches(matches)).toBe(2);
  });

  it('excludes bye/sit-out rows (team_b_id null), even if marked complete', () => {
    const matches = [
      { team_b_id: 'b1', status: 'complete' },
      { team_b_id: null, status: 'pending' },
      { team_b_id: null, status: 'complete' },
    ];
    expect(countPlayedMatches(matches)).toBe(1);
  });

  it('excludes skipped matches', () => {
    const matches = [
      { team_b_id: 'b1', status: 'complete' },
      { team_b_id: 'b2', status: 'skipped' },
    ];
    expect(countPlayedMatches(matches)).toBe(1);
  });

  it('excludes pending (unplayed) matches', () => {
    const matches = [
      { team_b_id: 'b1', status: 'complete' },
      { team_b_id: 'b2', status: 'pending' },
    ];
    expect(countPlayedMatches(matches)).toBe(1);
  });

  it('returns 0 for an empty list', () => {
    expect(countPlayedMatches([])).toBe(0);
  });

  it('matches the real-data case that surfaced this bug: 18 rows, 5 byes, 13 played', () => {
    const matches = [
      ...Array.from({ length: 13 }, () => ({ team_b_id: 'b', status: 'complete' })),
      ...Array.from({ length: 5 }, () => ({ team_b_id: null, status: 'pending' })),
    ];
    expect(countPlayedMatches(matches)).toBe(13);
  });
});
