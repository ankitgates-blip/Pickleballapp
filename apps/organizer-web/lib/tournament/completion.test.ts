import { describe, it, expect } from 'vitest';
import { isTournamentComplete, canEditScore, canEditTeams } from './completion';
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

  it('returns false for league_playoffs with fewer than 4 teams when fewer rounds than the target have been played', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
    ];
    expect(isTournamentComplete('league_playoffs', 3, matches, 5)).toBe(false);
  });

  it('returns false for league_playoffs with fewer than 4 teams when the target round exists but its matches are not all complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'pending', teamBId: 't3', round: 2 },
    ];
    expect(isTournamentComplete('league_playoffs', 3, matches, 2)).toBe(false);
  });

  it('returns true for league_playoffs with fewer than 4 teams once the target round is reached and all matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: 't3', round: 2 },
    ];
    expect(isTournamentComplete('league_playoffs', 3, matches, 2)).toBe(true);
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

  it('returns false for up_and_down_the_river when fewer rounds than the target have been played', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
    ];
    expect(isTournamentComplete('up_and_down_the_river', 4, matches, 5)).toBe(false);
  });

  it('returns false for up_and_down_the_river when the target round exists but its matches are not all complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'pending', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('up_and_down_the_river', 4, matches, 2)).toBe(false);
  });

  it('returns true for up_and_down_the_river once the target round is reached and all matches are complete', () => {
    const matches: CompletionCheckMatch[] = [
      { stage: 'league', status: 'complete', teamBId: 't2', round: 1 },
      { stage: 'league', status: 'complete', teamBId: 't4', round: 2 },
    ];
    expect(isTournamentComplete('up_and_down_the_river', 4, matches, 2)).toBe(true);
  });
});

describe('canEditScore', () => {
  it('is editable when the tournament is not complete', () => {
    expect(canEditScore(null, null)).toBe(true);
  });

  it('is not editable when complete but not yet unlocked', () => {
    expect(canEditScore('2026-08-20T10:00:00.000Z', null)).toBe(false);
  });

  it('is editable when complete and unlocked', () => {
    expect(canEditScore('2026-08-20T10:00:00.000Z', '2026-08-20T11:00:00.000Z')).toBe(true);
  });
});

describe('canEditTeams', () => {
  it('is not editable when the tournament is not complete', () => {
    expect(canEditTeams(null, null)).toBe(false);
  });

  it('is not editable when complete but not unlocked', () => {
    expect(canEditTeams('2026-08-20T10:00:00.000Z', null)).toBe(false);
  });

  it('is editable when complete and unlocked', () => {
    expect(canEditTeams('2026-08-20T10:00:00.000Z', '2026-08-20T11:00:00.000Z')).toBe(true);
  });
});

describe('canEditTeams implies canEditScore', () => {
  it('never allows team edits while scores are locked', () => {
    // expect.hasAssertions() makes this test fail loudly (instead of passing
    // vacuously) if a future change to canEditTeams ever makes it return
    // false for every case below, since then the loop body would never run.
    expect.hasAssertions();
    const cases: Array<[string | null, string | null]> = [
      [null, null],
      [null, '2026-08-20T11:00:00.000Z'],
      ['2026-08-20T10:00:00.000Z', null],
      ['2026-08-20T10:00:00.000Z', '2026-08-20T11:00:00.000Z'],
    ];
    for (const [completedAt, resultsUnlockedAt] of cases) {
      if (canEditTeams(completedAt, resultsUnlockedAt)) {
        expect(canEditScore(completedAt, resultsUnlockedAt)).toBe(true);
      }
    }
  });
});
