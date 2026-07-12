import { describe, it, expect } from 'vitest';
import { generateClaimTheThroneRound } from './claimTheThrone';
import type { ClaimTheThroneRoundResult } from '@/lib/types';

describe('generateClaimTheThroneRound', () => {
  it('throws when player count is not a positive multiple of 4', () => {
    expect(() => generateClaimTheThroneRound(['a', 'b', 'c'], [])).toThrow();
    expect(() => generateClaimTheThroneRound([], [])).toThrow();
  });

  it('round 1 (no history) assigns every player to exactly one of numCourts courts, 4 players each', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']; // 8 players -> 2 courts
    const pairings = generateClaimTheThroneRound(players, []);

    expect(pairings).toHaveLength(2);
    const courts = pairings.map((p) => p.court).sort();
    expect(courts).toEqual([1, 2]);

    const allPlayers = pairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]);
    expect(new Set(allPlayers).size).toBe(8);
    expect(allPlayers).toHaveLength(8);

    for (const p of pairings) {
      const four = [...p.teamAPlayerIds, ...p.teamBPlayerIds];
      expect(new Set(four).size).toBe(4);
    }
  });

  it('moves both winners up a court and both losers down a court', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']; // 12 players -> 3 courts
    const previousRoundMatches: ClaimTheThroneRoundResult[] = [
      { court: 1, teamAPlayerIds: ['A', 'B'], teamBPlayerIds: ['C', 'D'], scoreA: 11, scoreB: 7 }, // A,B win at court1 -> stay at 1 (can't go higher); C,D lose -> move to court2
      { court: 2, teamAPlayerIds: ['E', 'F'], teamBPlayerIds: ['G', 'H'], scoreA: 11, scoreB: 7 }, // E,F win -> move to court1; G,H lose -> move to court3
      { court: 3, teamAPlayerIds: ['I', 'J'], teamBPlayerIds: ['K', 'L'], scoreA: 11, scoreB: 7 }, // I,J win -> move to court2; K,L lose -> stay at court3 (can't go lower)
    ];

    const pairings = generateClaimTheThroneRound(players, previousRoundMatches);
    const playersAtCourt = new Map(
      pairings.map((p) => [p.court, new Set([...p.teamAPlayerIds, ...p.teamBPlayerIds])])
    );

    // Court 1 should now have: A,B (stayed, won) + E,F (moved up from court 2)
    expect(playersAtCourt.get(1)).toEqual(new Set(['A', 'B', 'E', 'F']));
    // Court 2 should now have: C,D (moved down from court 1) + I,J (moved up from court 3)
    expect(playersAtCourt.get(2)).toEqual(new Set(['C', 'D', 'I', 'J']));
    // Court 3 should now have: G,H (moved down from court 2) + K,L (stayed, lost)
    expect(playersAtCourt.get(3)).toEqual(new Set(['G', 'H', 'K', 'L']));
  });

  it('splits partners: no new team is identical to a team from the immediately preceding round', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const previousRoundMatches: ClaimTheThroneRoundResult[] = [
      { court: 1, teamAPlayerIds: ['A', 'B'], teamBPlayerIds: ['C', 'D'], scoreA: 11, scoreB: 7 },
      { court: 2, teamAPlayerIds: ['E', 'F'], teamBPlayerIds: ['G', 'H'], scoreA: 11, scoreB: 7 },
    ];

    const pairings = generateClaimTheThroneRound(players, previousRoundMatches);

    const priorTeams = [
      new Set(['A', 'B']), new Set(['C', 'D']), new Set(['E', 'F']), new Set(['G', 'H']),
    ];
    const newTeams = pairings.flatMap((p) => [new Set(p.teamAPlayerIds), new Set(p.teamBPlayerIds)]);

    for (const newTeam of newTeams) {
      const matchesAPriorTeam = priorTeams.some(
        (priorTeam) =>
          newTeam.size === priorTeam.size &&
          [...newTeam].every((id) => priorTeam.has(id))
      );
      expect(matchesAPriorTeam).toBe(false);
    }
  });
});
