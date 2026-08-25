import { describe, it, expect } from 'vitest';
import { isLadderFormat, usesIndividualStandings } from './formats';

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

describe('usesIndividualStandings', () => {
  it('returns true for every isIndividualFormat value', () => {
    expect(usesIndividualStandings('popcorn')).toBe(true);
    expect(usesIndividualStandings('gauntlet')).toBe(true);
    expect(usesIndividualStandings('claim_the_throne')).toBe(true);
    expect(usesIndividualStandings('up_and_down_the_river')).toBe(true);
  });

  it('returns true for custom', () => {
    expect(usesIndividualStandings('custom')).toBe(true);
  });

  it('returns false for team-based, non-custom formats', () => {
    expect(usesIndividualStandings('round_robin')).toBe(false);
    expect(usesIndividualStandings('double_header')).toBe(false);
    expect(usesIndividualStandings('league_playoffs')).toBe(false);
    expect(usesIndividualStandings('cream_of_the_crop')).toBe(false);
  });
});
