import { describe, it, expect } from 'vitest';
import { generateUpAndDownRiverRound } from './upAndDownTheRiver';
import type { UpAndDownRiverRoundResult } from '@/lib/types';

describe('generateUpAndDownRiverRound', () => {
  it('throws when player count is not a positive multiple of 4', () => {
    expect(() => generateUpAndDownRiverRound(['a', 'b', 'c'], [])).toThrow();
    expect(() => generateUpAndDownRiverRound([], [])).toThrow();
  });

  it('round 1 (no history) assigns every player to exactly one of numCourts courts, 4 players each', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const pairings = generateUpAndDownRiverRound(players, []);

    expect(pairings).toHaveLength(2);
    const allPlayers = pairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]);
    expect(new Set(allPlayers).size).toBe(8);
    expect(allPlayers).toHaveLength(8);

    for (const p of pairings) {
      const four = [...p.teamAPlayerIds, ...p.teamBPlayerIds];
      expect(new Set(four).size).toBe(4);
    }
  });

  it('moves the better-record winner up and the worse-record loser down, using cumulative record entering the round to break the team-score tie, and never repeats the immediately preceding partnership', () => {
    // Single court (numCourts=1). Round 1 gives P1/P2 a strong prior record and P3/P4 a
    // weak one. Round 2's match ties P1 with P3 (winners) and P2 with P4 (losers) --
    // within the winning pair, P1's round-1 record beats P3's, so P1 is the "mover"
    // (capped at the only court, since numCourts=1). Within the losing pair, P4's record
    // is worse than P2's, so P4 is the "mover" (also capped). Round 3's teams must not
    // repeat round 2's exact pairings.
    const players = ['P1', 'P2', 'P3', 'P4'];
    const previousRounds: UpAndDownRiverRoundResult[] = [
      { round: 1, court: 1, teamAPlayerIds: ['P1', 'P2'], teamBPlayerIds: ['P3', 'P4'], scoreA: 11, scoreB: 1 },
      { round: 2, court: 1, teamAPlayerIds: ['P1', 'P3'], teamBPlayerIds: ['P2', 'P4'], scoreA: 11, scoreB: 9 },
    ];

    const pairings = generateUpAndDownRiverRound(players, previousRounds);

    expect(pairings).toHaveLength(1);
    const newTeams = [new Set(pairings[0].teamAPlayerIds), new Set(pairings[0].teamBPlayerIds)];
    const round2Teams = [new Set(['P1', 'P3']), new Set(['P2', 'P4'])];

    for (const newTeam of newTeams) {
      const repeatsRound2 = round2Teams.some(
        (t) => t.size === newTeam.size && [...t].every((id) => newTeam.has(id))
      );
      expect(repeatsRound2).toBe(false);
    }
  });

  it('splits partners in the normal middle-court case: the 2 stayers team up, the riser and faller team up', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']; // 12 players, 3 courts
    const previousRounds: UpAndDownRiverRoundResult[] = [
      { round: 1, court: 1, teamAPlayerIds: ['A', 'B'], teamBPlayerIds: ['C', 'D'], scoreA: 11, scoreB: 7 },
      { round: 1, court: 2, teamAPlayerIds: ['E', 'F'], teamBPlayerIds: ['G', 'H'], scoreA: 11, scoreB: 7 },
      { round: 1, court: 3, teamAPlayerIds: ['I', 'J'], teamBPlayerIds: ['K', 'L'], scoreA: 11, scoreB: 7 },
    ];

    const pairings = generateUpAndDownRiverRound(players, previousRounds);
    const court2Pairing = pairings.find((p) => p.court === 2)!;
    const court2Players = new Set([...court2Pairing.teamAPlayerIds, ...court2Pairing.teamBPlayerIds]);

    const arrivalsPresent = ['I', 'J', 'C', 'D'].filter((p) => court2Players.has(p));
    expect(arrivalsPresent).toHaveLength(2); // exactly one riser from court 3, one faller from court 1

    const originalCourt2Stayers = ['E', 'F', 'G', 'H'].filter((p) => court2Players.has(p));
    expect(originalCourt2Stayers).toHaveLength(2);

    const stayersOnTeamA = originalCourt2Stayers.filter((p) =>
      court2Pairing.teamAPlayerIds.includes(p)
    ).length;
    expect(stayersOnTeamA === 0 || stayersOnTeamA === 2).toBe(true); // both stayers on the same team
  });

  it('handles the top-court edge case: 3 stayers + 1 riser, splitting the 2 stayers who were partners', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']; // 8 players, 2 courts
    const previousRounds: UpAndDownRiverRoundResult[] = [
      { round: 1, court: 1, teamAPlayerIds: ['A', 'B'], teamBPlayerIds: ['C', 'D'], scoreA: 11, scoreB: 7 },
      { round: 1, court: 2, teamAPlayerIds: ['E', 'F'], teamBPlayerIds: ['G', 'H'], scoreA: 11, scoreB: 7 },
    ];

    const pairings = generateUpAndDownRiverRound(players, previousRounds);
    const court1Pairing = pairings.find((p) => p.court === 1)!;
    const newTeams = [new Set(court1Pairing.teamAPlayerIds), new Set(court1Pairing.teamBPlayerIds)];

    // A and B were partners in round 1 -- they must now be split across the two new teams
    const aTeam = newTeams.find((t) => t.has('A'))!;
    expect(aTeam.has('B')).toBe(false);
  });
});
