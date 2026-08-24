import { describe, it, expect } from 'vitest';
import { computeCustomAutoRound, customFullCoverageRounds } from './customAuto';
import type { CustomAutoTeam, CustomAutoMatch } from '@/lib/types';

const teams = (ids: string[]): CustomAutoTeam[] => ids.map((id) => ({ id }));

describe('computeCustomAutoRound', () => {
  it('throws with fewer than 2 teams', () => {
    expect(() => computeCustomAutoRound(teams(['a']), [], 1)).toThrow();
  });

  it('pairs an even number of teams with nobody sitting out', () => {
    const pairings = computeCustomAutoRound(teams(['a', 'b', 'c', 'd']), [], 1);
    expect(pairings).toHaveLength(2);
    const allTeams = pairings.flatMap((p) => [p.teamAId, p.teamBId]);
    expect(new Set(allTeams).size).toBe(4);
  });

  it('sits out exactly one team with an odd number of teams', () => {
    const pairings = computeCustomAutoRound(teams(['a', 'b', 'c', 'd', 'e']), [], 1);
    expect(pairings).toHaveLength(2); // 2 matches, 1 team unpaired
    const playing = new Set(pairings.flatMap((p) => [p.teamAId, p.teamBId]));
    expect(playing.size).toBe(4);
  });

  it('rotates who sits out fairly across sequential rounds, given a mix of manual and auto history', () => {
    const t = teams(['a', 'b', 'c', 'd', 'e']);

    // Round 1: organizer manually paired a-b and c-d, leaving e as standby (not
    // recorded anywhere -- the point is the algorithm derives this from what's missing).
    let history: CustomAutoMatch[] = [
      { round: 1, teamAId: 'a', teamBId: 'b' },
      { round: 1, teamAId: 'c', teamBId: 'd' },
    ];

    // Auto-generate round 2: e sat out round 1 (sitOutCounts: e=1, a=b=c=d=0), so e must
    // play now -- the sit-out slot goes to whichever of a/b/c/d has the fewest sit-outs
    // (tied at 0), never to e while a lower count exists.
    const round2 = computeCustomAutoRound(t, history, 2);
    const round2Playing = new Set(round2.flatMap((p) => [p.teamAId, p.teamBId]));
    expect(round2Playing.has('e')).toBe(true);
    history = [...history, ...round2.map((p) => ({ round: 2, ...p }))];

    // Auto-generate round 3: sit-out counts are now e=1 (round 1), plus whichever team
    // sat out round 2 also has 1 -- both of those teams already had their turn to sit
    // out, so round 3's sit-out must come from whichever teams still have 0. Concretely:
    // both e and 'a' (a was the team round 2 chose to sit out, being first among the
    // 0-count ties) already have 1 sit-out each, so both must play round 3.
    const round3 = computeCustomAutoRound(t, history, 3);
    const round3Playing = new Set(round3.flatMap((p) => [p.teamAId, p.teamBId]));
    expect(round3Playing.has('a')).toBe(true);
    expect(round3Playing.has('e')).toBe(true);
  });

  it('prefers pairs that have not played each other yet', () => {
    const history: CustomAutoMatch[] = [{ round: 1, teamAId: 'a', teamBId: 'b' }];
    const round2 = computeCustomAutoRound(teams(['a', 'b', 'c', 'd']), history, 2);
    const key = (p: { teamAId: string; teamBId: string }) => [p.teamAId, p.teamBId].sort().join('::');
    expect(round2.map(key)).not.toContain('a::b');
  });

  it('falls back to the least-recently-played rematch once every fresh pairing is exhausted', () => {
    // 3 teams can never all avoid rematches (round-robin coverage for 3 teams is 3
    // rounds, but each round only fits 1 match with 1 sitting out -- by round 4 every
    // pair has met at least once).
    let history: CustomAutoMatch[] = [];
    for (let round = 1; round <= 3; round++) {
      const pairing = computeCustomAutoRound(teams(['a', 'b', 'c']), history, round);
      history = [...history, ...pairing.map((p) => ({ round, ...p }))];
    }
    // Round 4: every pair has now met exactly once (a-b, a-c, b-c across rounds 1-3).
    // The round-4 pairing should reuse the pair that met LEAST recently (lowest round number).
    const round4 = computeCustomAutoRound(teams(['a', 'b', 'c']), history, 4);
    expect(round4).toHaveLength(1);
    const key = [round4[0].teamAId, round4[0].teamBId].sort().join('::');
    const meetingRounds = new Map<string, number>();
    for (const m of history) {
      meetingRounds.set([m.teamAId, m.teamBId].sort().join('::'), m.round);
    }
    const leastRecentRound = Math.min(...meetingRounds.values());
    expect(meetingRounds.get(key)).toBe(leastRecentRound);
  });

  it('reaches full round-robin coverage for 5 teams across 5 rounds (2-opt regression)', () => {
    // Greedy pairing alone (no lookahead) leaves several pairs unplayed for 5 teams over
    // 5 rounds -- this is the smallest clear reproduction of that bug. The 2-opt
    // local-improvement pass after the greedy step must close the gap so that, by round 5
    // (the exact round count customFullCoverageRounds promises for 5 teams), every one of
    // the C(5,2) = 10 distinct pairs has met exactly once.
    const t = teams(['a', 'b', 'c', 'd', 'e']);
    let history: CustomAutoMatch[] = [];
    for (let round = 1; round <= 5; round++) {
      const pairing = computeCustomAutoRound(t, history, round);
      history = [...history, ...pairing.map((p) => ({ round, ...p }))];
    }
    const metCount = new Map<string, number>();
    for (const m of history) {
      const key = [m.teamAId, m.teamBId].sort().join('::');
      metCount.set(key, (metCount.get(key) ?? 0) + 1);
    }
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const expectedPairs: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expectedPairs.push([ids[i], ids[j]].sort().join('::'));
      }
    }
    expect(expectedPairs).toHaveLength(10);
    for (const pair of expectedPairs) {
      expect(metCount.get(pair)).toBe(1);
    }
  });

  it('reaches full round-robin coverage for 10 teams across 9 rounds (exact-matching regression)', () => {
    // 10 teams is even (customFullCoverageRounds = 9, nobody ever sits out). This was the
    // smallest case where greedy+2-opt got stuck in a local optimum, leaving 2 of the
    // C(10,2) = 45 pairs unplayed while others rematched. Exact minimum-cost matching must
    // reach full coverage: every pair meets exactly once across the 9 rounds.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const t = teams(ids);
    let history: CustomAutoMatch[] = [];
    for (let round = 1; round <= 9; round++) {
      const pairing = computeCustomAutoRound(t, history, round);
      history = [...history, ...pairing.map((p) => ({ round, ...p }))];
    }
    const metCount = new Map<string, number>();
    for (const m of history) {
      const key = [m.teamAId, m.teamBId].sort().join('::');
      metCount.set(key, (metCount.get(key) ?? 0) + 1);
    }
    const expectedPairs: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expectedPairs.push([ids[i], ids[j]].sort().join('::'));
      }
    }
    expect(expectedPairs).toHaveLength(45);
    for (const pair of expectedPairs) {
      expect(metCount.get(pair)).toBe(1);
    }
  });

  it('reaches full round-robin coverage for 13 teams across 13 rounds (exact-matching regression)', () => {
    // 13 teams is odd (customFullCoverageRounds = 13, one team sits out each round). This
    // was the worst previously-failing case: greedy+2-opt left 5 of the C(13,2) = 78 pairs
    // unplayed. Exact minimum-cost matching must reach full coverage: every pair meets
    // exactly once across the 13 rounds.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'];
    const t = teams(ids);
    let history: CustomAutoMatch[] = [];
    for (let round = 1; round <= 13; round++) {
      const pairing = computeCustomAutoRound(t, history, round);
      history = [...history, ...pairing.map((p) => ({ round, ...p }))];
    }
    const metCount = new Map<string, number>();
    for (const m of history) {
      const key = [m.teamAId, m.teamBId].sort().join('::');
      metCount.set(key, (metCount.get(key) ?? 0) + 1);
    }
    const expectedPairs: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expectedPairs.push([ids[i], ids[j]].sort().join('::'));
      }
    }
    expect(expectedPairs).toHaveLength(78);
    for (const pair of expectedPairs) {
      expect(metCount.get(pair)).toBe(1);
    }
  });

  it('is deterministic -- same inputs always produce the same output', () => {
    const t = teams(['a', 'b', 'c', 'd', 'e']);
    const history: CustomAutoMatch[] = [{ round: 1, teamAId: 'a', teamBId: 'b' }];
    const first = computeCustomAutoRound(t, history, 2);
    const second = computeCustomAutoRound(t, history, 2);
    expect(first).toEqual(second);
  });
});

describe('customFullCoverageRounds', () => {
  it('returns teamCount rounds for an odd team count', () => {
    expect(customFullCoverageRounds(5)).toBe(5);
  });

  it('returns teamCount - 1 rounds for an even team count', () => {
    expect(customFullCoverageRounds(4)).toBe(3);
  });

  it('returns 0 for fewer than 2 teams', () => {
    expect(customFullCoverageRounds(1)).toBe(0);
    expect(customFullCoverageRounds(0)).toBe(0);
  });
});
