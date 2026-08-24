import { describe, it, expect } from 'vitest';
import { isLadderFormat } from './formats';

describe('isLadderFormat', () => {
  it('returns true for claim_the_throne and up_and_down_the_river', () => {
    expect(isLadderFormat('claim_the_throne')).toBe(true);
    expect(isLadderFormat('up_and_down_the_river')).toBe(true);
  });

  it('returns false for every other format', () => {
    expect(isLadderFormat('round_robin')).toBe(false);
    expect(isLadderFormat('popcorn')).toBe(false);
    expect(isLadderFormat('gauntlet')).toBe(false);
    expect(isLadderFormat('double_header')).toBe(false);
    expect(isLadderFormat('league_playoffs')).toBe(false);
    expect(isLadderFormat('custom')).toBe(false);
    expect(isLadderFormat('cream_of_the_crop')).toBe(false);
  });
});
