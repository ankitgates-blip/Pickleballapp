import { describe, it, expect } from 'vitest';
import { isTournamentComplete } from './completion';
import type { CompletionCheckMatch } from '@/lib/types';

describe('isTournamentComplete', () => {
  it('returns false for a non-league_playoffs format with a pending match', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'pending', teamBId: 't3', round: 1 },
    ];
    expect(isTournamentComplete('round_robin', 2, matches)).toBe(false);
  });

  it('returns true for a non-league_playoffs format once all real matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: null, round: 1 },
    ];
    expect(isTournamentComplete('round_robin', 2, matches)).toBe(true);
  });

  it('treats league_playoffs with fewer than 4 teams like a normal single-stage format', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
    ];
    expect(isTournamentComplete('league_playoffs', 3, matches)).toBe(true);
  });

  it('returns false for league_playoffs with 4+ teams when league is done but no final exists yet', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: 't4', round: 1 },
      { stage: 'semifinal', status: 'complete', teamBId: 't5', round: 1 },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(false);
  });

  it('returns true for league_playoffs with 4+ teams once the final match is complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'final', status: 'complete', teamBId: 't5', round: 1 },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(true);
  });

  it('returns false for league_playoffs with 4+ teams when the final exists but is not complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'final', status: 'pending', teamBId: 't5', round: 1 },
    ];
    expect(isTournamentComplete('league_playoffs', 4, matches)).toBe(false);
  });

  it('returns false for gauntlet when fewer rounds than the target have been played', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
    ];
    expect(isTournamentComplete('gauntlet', 4, matches, 5)).toBe(false);
  });

  it('returns false for gauntlet when the target round exists but its matches are not all complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'pending', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('gauntlet', 4, matches, 2)).toBe(false);
  });

  it('returns true for gauntlet once the target round is reached and all matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('gauntlet', 4, matches, 2)).toBe(true);
  });

  it('returns false for claim_the_throne when fewer rounds than the target have been played', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
    ];
    expect(isTournamentComplete('claim_the_throne', 4, matches, 5)).toBe(false);
  });

  it('returns false for claim_the_throne when the target round exists but its matches are not all complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'pending', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('claim_the_throne', 4, matches, 2)).toBe(false);
  });

  it('returns true for claim_the_throne once the target round is reached and all matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('claim_the_throne', 4, matches, 2)).toBe(true);
  });
});
