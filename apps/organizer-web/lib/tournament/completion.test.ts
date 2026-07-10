import { describe, it, expect } from 'vitest';
import { isTournamentComplete } from './completion';
import type { CompletionCheckMatch } from '@/lib/types';

describe('isTournamentComplete', () => {
  it('returns false for a non-league_playoffs format with a pending match', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
      { stage: 'league', status: 'pending', teamBId: 't3' },
    ];
    expect(isTournamentComplete('round_robin', 2, matches)).toBe(false);
  });

  it('returns true for a non-league_playoffs format once all real matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
      { stage: 'league', status: 'complete', teamBId: null },
    ];
    expect(isTournamentComplete('round_robin', 2, matches)).toBe(true);
  });

  it('treats league_playoffs with fewer than 4 teams like a normal single-stage format', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
    ];
    expect(isTournamentComplete('league_playoffs', 3, matches)).toBe(true);
  });

  it('returns false for league_playoffs with 4+ teams when league is done but no final exists yet', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
      { stage: 'league', status: 'complete', teamBId: 't4' },
      { stage: 'semifinal', status: 'complete', teamBId: 't5' },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(false);
  });

  it('returns true for league_playoffs with 4+ teams once the final match is complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2' },
      { stage: 'final', status: 'complete', teamBId: 't5' },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(true);
  });

  it('returns false for league_playoffs with 4+ teams when the final exists but is not complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'final', status: 'pending', teamBId: 't5' },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(false);
  });
});
