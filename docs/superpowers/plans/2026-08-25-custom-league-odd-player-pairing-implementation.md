# Custom League Odd-Player Dynamic Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Custom League, when the tournament's total player count is odd, nobody is permanently benched — matches for that round pair individual players directly (fairly rotating who sits out and who partners whom) instead of relying on fixed, organizer-assigned teams.

**Architecture:** Two new pure, unit-tested modules compute this: `customPlayerHistory.ts` derives player-level fairness history (sit-outs, partner/opponent counts) from the tournament's full match record so far — regardless of whether a given past round came from fixed teams or dynamic pairing — and `customDynamic.ts` uses that history to compute one round's player pairings, adapted from `popcorn.ts`'s existing grouping algorithm but deterministic (no RNG) and single-round. `bracket/actions.ts`'s `autoGenerateCustomRound` and `addCustomMatch` branch on the tournament's *current* total player count (re-checked every generation, not stored) to pick the fixed-team path (even, unchanged) or the new dynamic path (odd).

**Tech Stack:** Next.js Server Actions (Supabase), TypeScript, Vitest.

## Global Constraints

- Mode is decided by the tournament's live total player count at the moment a round is generated or a match is manually added — not a stored flag. A tournament can be even for round 1 and odd for round 2 after a sign-up.
- Even mode is **completely unchanged**: `computeCustomAutoRound`, its tests, and its call site logic are not modified by this plan.
- The new dynamic-mode algorithm is **deterministic** (no `Math.random`/RNG parameter) — ties broken by input array order, matching `computeCustomAutoRound`'s existing convention, not `popcorn.ts`'s shuffle-based one.
- A match needs exactly 4 players (2 teams of 2). Dynamic mode sits out `playerIds.length % 4` players per round (same floor as `generateGauntletRound`/`generatePopcornSchedule`) and throws if fewer than 4 players total.
- Ad-hoc teams (formed by dynamic pairing) are stored in the existing `teams` table exactly like Popcorn/Gauntlet already do — no schema change, no new team-storage concept. The existing private `pairKey(a, b): string` helper in `bracket/actions.ts` (joins sorted ids with `|`) is reused for ad-hoc team lookup-or-create in both call sites — do not introduce a second one.
- `bracket/actions.ts` and every `page.tsx` have zero test coverage anywhere in this codebase, by established convention (confirmed in the prior court-assignment feature's plan). Do not add test files for `actions.ts`, `bracket/page.tsx`, or `teams/page.tsx` — verify those changes via `npm run build` (typecheck) + `npm test` (regression) only.
- Test command: `npm test` (Vitest) from `apps/organizer-web`. Build/typecheck: `npm run build` from `apps/organizer-web`.

---

### Task 1: `lib/tournament/customPlayerHistory.ts` — shared player-level fairness ledger

**Files:**
- Create: `apps/organizer-web/lib/tournament/customPlayerHistory.ts`
- Test: `apps/organizer-web/lib/tournament/customPlayerHistory.test.ts`

**Interfaces:**
- Produces: `PlayerHistory` type and `derivePlayerHistory(playerIds, matches, teams, beforeRound): PlayerHistory`, used by Task 2 and Task 3.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/tournament/customPlayerHistory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { derivePlayerHistory } from './customPlayerHistory';

const teams = [
  { id: 't1', player1Id: 'a', player2Id: 'b' },
  { id: 't2', player1Id: 'c', player2Id: 'd' },
  { id: 't3', player1Id: 'e', player2Id: 'f' },
];

describe('derivePlayerHistory', () => {
  it('returns zeroed history when there are no matches', () => {
    const history = derivePlayerHistory(['a', 'b', 'c', 'd'], [], teams, 1);
    expect(history.sitOutCounts.get('a')).toBe(0);
    expect(history.sitOutCounts.get('d')).toBe(0);
    expect(history.partnerCounts.size).toBe(0);
    expect(history.opponentCounts.size).toBe(0);
    expect(history.lastMetRound.size).toBe(0);
  });

  it('expands a single match into partner and opponent counts for its 4 players', () => {
    const matches = [{ round: 1, teamAId: 't1', teamBId: 't2' }];
    const history = derivePlayerHistory(['a', 'b', 'c', 'd', 'e', 'f'], matches, teams, 2);

    expect(history.partnerCounts.get(['a', 'b'].sort().join('::'))).toBe(1);
    expect(history.partnerCounts.get(['c', 'd'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['a', 'c'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['a', 'd'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['b', 'c'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['b', 'd'].sort().join('::'))).toBe(1);
    expect(history.lastMetRound.get(['a', 'b'].sort().join('::'))).toBe(1);
  });

  it('counts players not on either team that round as sitting out', () => {
    const matches = [{ round: 1, teamAId: 't1', teamBId: 't2' }];
    const history = derivePlayerHistory(['a', 'b', 'c', 'd', 'e', 'f'], matches, teams, 2);

    expect(history.sitOutCounts.get('a')).toBe(0);
    expect(history.sitOutCounts.get('e')).toBe(1);
    expect(history.sitOutCounts.get('f')).toBe(1);
  });

  it('excludes rounds at or after beforeRound', () => {
    const matches = [
      { round: 1, teamAId: 't1', teamBId: 't2' },
      { round: 2, teamAId: 't1', teamBId: 't3' },
    ];
    const history = derivePlayerHistory(['a', 'b', 'c', 'd', 'e', 'f'], matches, teams, 2);

    // Only round 1 counted: round 2 (>= beforeRound) is excluded.
    expect(history.partnerCounts.get(['a', 'b'].sort().join('::'))).toBe(1);
    expect(history.opponentCounts.get(['a', 'e'].sort().join('::'))).toBeUndefined();
    expect(history.sitOutCounts.get('e')).toBe(1); // sat out round 1 only
  });

  it('accumulates counts and tracks the most recent round across multiple matches', () => {
    const matches = [
      { round: 1, teamAId: 't1', teamBId: 't2' },
      { round: 2, teamAId: 't1', teamBId: 't2' },
    ];
    const history = derivePlayerHistory(['a', 'b', 'c', 'd', 'e', 'f'], matches, teams, 3);

    expect(history.partnerCounts.get(['a', 'b'].sort().join('::'))).toBe(2);
    expect(history.opponentCounts.get(['a', 'c'].sort().join('::'))).toBe(2);
    expect(history.lastMetRound.get(['a', 'b'].sort().join('::'))).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/organizer-web`): `npx vitest run lib/tournament/customPlayerHistory.test.ts`
Expected: FAIL — `Cannot find module './customPlayerHistory'`.

- [ ] **Step 3: Write the implementation**

Create `apps/organizer-web/lib/tournament/customPlayerHistory.ts`:

```ts
export type PlayerHistory = {
  sitOutCounts: Map<string, number>;
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  lastMetRound: Map<string, number>;
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

// Derives player-level fairness history purely from match history -- covers rounds
// generated by EITHER the fixed-team (even player count) generator or the dynamic
// (odd player count) generator identically, by expanding each match's two teams into
// their four constituent players. This is what keeps fairness consistent across mode
// switches: a team's sit-out in an even round becomes its two players' sit-out here,
// exactly as if they'd sat out individually. See
// docs/superpowers/specs/2026-08-25-custom-league-odd-player-pairing-design.md.
export function derivePlayerHistory(
  playerIds: string[],
  matches: { round: number; teamAId: string; teamBId: string }[],
  teams: { id: string; player1Id: string; player2Id: string }[],
  beforeRound: number
): PlayerHistory {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const sitOutCounts = new Map<string, number>(playerIds.map((id) => [id, 0]));
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const lastMetRound = new Map<string, number>();

  const relevantMatches = matches.filter((m) => m.round < beforeRound);
  const roundsWithMatches = new Set(relevantMatches.map((m) => m.round));

  for (const round of roundsWithMatches) {
    const playingIds = new Set<string>();
    for (const m of relevantMatches.filter((mm) => mm.round === round)) {
      const teamA = teamById.get(m.teamAId);
      const teamB = teamById.get(m.teamBId);
      if (teamA) {
        playingIds.add(teamA.player1Id);
        playingIds.add(teamA.player2Id);
      }
      if (teamB) {
        playingIds.add(teamB.player1Id);
        playingIds.add(teamB.player2Id);
      }
    }
    for (const id of playerIds) {
      if (!playingIds.has(id)) {
        sitOutCounts.set(id, (sitOutCounts.get(id) ?? 0) + 1);
      }
    }
  }

  for (const m of relevantMatches) {
    const teamA = teamById.get(m.teamAId);
    const teamB = teamById.get(m.teamBId);
    if (!teamA || !teamB) continue;

    for (const [p1, p2] of [
      [teamA.player1Id, teamA.player2Id],
      [teamB.player1Id, teamB.player2Id],
    ] as const) {
      const key = pairKey(p1, p2);
      partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1);
      lastMetRound.set(key, Math.max(lastMetRound.get(key) ?? 0, m.round));
    }

    for (const a of [teamA.player1Id, teamA.player2Id]) {
      for (const b of [teamB.player1Id, teamB.player2Id]) {
        const key = pairKey(a, b);
        opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
        lastMetRound.set(key, Math.max(lastMetRound.get(key) ?? 0, m.round));
      }
    }
  }

  return { sitOutCounts, partnerCounts, opponentCounts, lastMetRound };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tournament/customPlayerHistory.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/customPlayerHistory.ts apps/organizer-web/lib/tournament/customPlayerHistory.test.ts
git commit -m "feat: derive shared player-level fairness history for Custom League"
```

---

### Task 2: `lib/tournament/customDynamic.ts` — odd-round pairing algorithm

**Files:**
- Create: `apps/organizer-web/lib/tournament/customDynamic.ts`
- Test: `apps/organizer-web/lib/tournament/customDynamic.test.ts`

**Interfaces:**
- Consumes: `PlayerHistory` type from `./customPlayerHistory` (Task 1).
- Produces: `CustomDynamicPairing` type and `computeCustomDynamicRound(playerIds, history): CustomDynamicPairing[]`, used by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/tournament/customDynamic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeCustomDynamicRound } from './customDynamic';
import type { PlayerHistory } from './customPlayerHistory';

function emptyHistory(playerIds: string[]): PlayerHistory {
  return {
    sitOutCounts: new Map(playerIds.map((id) => [id, 0])),
    partnerCounts: new Map(),
    opponentCounts: new Map(),
    lastMetRound: new Map(),
  };
}

describe('computeCustomDynamicRound', () => {
  it('throws with fewer than 4 players', () => {
    expect(() => computeCustomDynamicRound(['a', 'b', 'c'], emptyHistory(['a', 'b', 'c']))).toThrow();
  });

  it('pairs exactly 4 players into 1 match with nobody sitting out', () => {
    const players = ['a', 'b', 'c', 'd'];
    const pairings = computeCustomDynamicRound(players, emptyHistory(players));
    expect(pairings).toHaveLength(1);
    const allPlayers = pairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]);
    expect(new Set(allPlayers).size).toBe(4);
  });

  it('sits out exactly playerIds.length % 4 players, prioritizing fewest sit-outs', () => {
    const players = ['a', 'b', 'c', 'd', 'e'];
    const history = emptyHistory(players);
    history.sitOutCounts.set('a', 3); // a has sat out the most -- should NOT be picked to sit out again
    history.sitOutCounts.set('b', 0);

    const pairings = computeCustomDynamicRound(players, history);
    const playing = new Set(pairings.flatMap((p) => [...p.teamAPlayerIds, ...p.teamBPlayerIds]));
    expect(playing.size).toBe(4);
    expect(playing.has('a')).toBe(true); // a played -- b (fewest sit-outs) sat out instead
    expect(playing.has('b')).toBe(false);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const history = emptyHistory(players);
    const run1 = computeCustomDynamicRound(players, history);
    const run2 = computeCustomDynamicRound(players, history);
    expect(run1).toEqual(run2);
  });

  it('prefers pairing players who have not yet partnered over those who have', () => {
    const players = ['a', 'b', 'c', 'd'];
    const history = emptyHistory(players);
    // a+b and c+d have already partnered twice; a+c/b+d and a+d/b+c have never met.
    history.partnerCounts.set(['a', 'b'].sort().join('::'), 2);
    history.partnerCounts.set(['c', 'd'].sort().join('::'), 2);

    const pairings = computeCustomDynamicRound(players, history);
    expect(pairings).toHaveLength(1);
    const [pairing] = pairings;
    const teamA = new Set(pairing.teamAPlayerIds);
    // a and b must NOT be teamed together again when an unpaired-before split exists.
    expect(teamA.has('a') && teamA.has('b')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/organizer-web`): `npx vitest run lib/tournament/customDynamic.test.ts`
Expected: FAIL — `Cannot find module './customDynamic'`.

- [ ] **Step 3: Write the implementation**

Create `apps/organizer-web/lib/tournament/customDynamic.ts`:

```ts
import type { PlayerHistory } from './customPlayerHistory';

export type CustomDynamicPairing = {
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

function pairMeetingCost(a: string, b: string, history: PlayerHistory): number {
  const key = pairKey(a, b);
  const meetings = (history.partnerCounts.get(key) ?? 0) + (history.opponentCounts.get(key) ?? 0);
  const lastMet = history.lastMetRound.get(key) ?? 0;
  return meetings * 1_000_000 + lastMet;
}

function groupCost(group: string[], history: PlayerHistory): number {
  let cost = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      cost += pairMeetingCost(group[i], group[j], history);
    }
  }
  return cost;
}

function partnerMeetingCost(a: string, b: string, history: PlayerHistory): number {
  const key = pairKey(a, b);
  const partners = history.partnerCounts.get(key) ?? 0;
  const lastMet = history.lastMetRound.get(key) ?? 0;
  return partners * 1_000_000 + lastMet;
}

function splitCost(
  teamA: [string, string],
  teamB: [string, string],
  history: PlayerHistory
): number {
  return partnerMeetingCost(teamA[0], teamA[1], history) + partnerMeetingCost(teamB[0], teamB[1], history);
}

// Computes one round's pairings from a player-history snapshot (see customPlayerHistory.ts).
// Throws if fewer than 4 players are supplied -- a match needs 4 players, same floor as
// generateGauntletRound / generatePopcornSchedule. Sits out playerIds.length % 4 players
// (fewest sit-outs first, ties broken by input order -- deterministic, no randomness,
// matching computeCustomAutoRound's convention rather than popcorn.ts's shuffle-based one),
// then groups the rest into foursomes and splits each into two teams, minimizing repeat
// partners/opponents. Adapted from popcorn.ts's per-round grouping shape but reimplemented
// fresh for a single round with deterministic tie-breaking -- see
// docs/superpowers/specs/2026-08-25-custom-league-odd-player-pairing-design.md.
export function computeCustomDynamicRound(
  playerIds: string[],
  history: PlayerHistory
): CustomDynamicPairing[] {
  if (playerIds.length < 4) {
    throw new Error('Need at least 4 players for a Custom League dynamic round');
  }

  const sitOutsThisRound = playerIds.length % 4;
  const byFairness = [...playerIds].sort((a, b) => {
    const diff = (history.sitOutCounts.get(a) ?? 0) - (history.sitOutCounts.get(b) ?? 0);
    if (diff !== 0) return diff;
    return playerIds.indexOf(a) - playerIds.indexOf(b);
  });
  const sittingOutIds = new Set(byFairness.slice(0, sitOutsThisRound));
  let active = playerIds.filter((id) => !sittingOutIds.has(id));

  const pairings: CustomDynamicPairing[] = [];

  while (active.length > 0) {
    const anchor = active[0];
    const rest = active.slice(1);

    let bestGroup: string[] = active.slice(0, 4);
    let bestCost = Infinity;

    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        for (let k = j + 1; k < rest.length; k++) {
          const group = [anchor, rest[i], rest[j], rest[k]];
          const cost = groupCost(group, history);
          if (cost < bestCost) {
            bestCost = cost;
            bestGroup = group;
          }
        }
      }
    }

    const [p1, p2, p3, p4] = bestGroup;
    const splits: Array<[[string, string], [string, string]]> = [
      [[p1, p2], [p3, p4]],
      [[p1, p3], [p2, p4]],
      [[p1, p4], [p2, p3]],
    ];

    let bestSplit = splits[0];
    let bestSplitCost = Infinity;
    for (const split of splits) {
      const cost = splitCost(split[0], split[1], history);
      if (cost < bestSplitCost) {
        bestSplitCost = cost;
        bestSplit = split;
      }
    }

    const [teamA, teamB] = bestSplit;
    pairings.push({ teamAPlayerIds: teamA, teamBPlayerIds: teamB });

    active = active.filter((id) => !bestGroup.includes(id));
  }

  return pairings;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tournament/customDynamic.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/customDynamic.ts apps/organizer-web/lib/tournament/customDynamic.test.ts
git commit -m "feat: add deterministic odd-round dynamic pairing for Custom League"
```

---

### Task 3: Wire `autoGenerateCustomRound` to branch even/odd

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `derivePlayerHistory` from `@/lib/tournament/customPlayerHistory` (Task 1), `computeCustomDynamicRound` from `@/lib/tournament/customDynamic` (Task 2), the existing private `pairKey` helper already in this file (line ~251).

- [ ] **Step 1: Add the imports**

Change:
```ts
import { computeCustomAutoRound } from '@/lib/tournament/customAuto';
```
to:
```ts
import { computeCustomAutoRound } from '@/lib/tournament/customAuto';
import { derivePlayerHistory } from '@/lib/tournament/customPlayerHistory';
import { computeCustomDynamicRound } from '@/lib/tournament/customDynamic';
```

- [ ] **Step 2: Replace `autoGenerateCustomRound`**

The function currently reads (exact current text):

```ts
export async function autoGenerateCustomRound(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Auto-generate is only available for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to auto-generate a round.');
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!teams || teams.length < 2) {
    throw new Error('Need at least 2 teams to auto-generate a round.');
  }

  const { data: existingMatchesRaw, error: matchesError } = await supabase
    .from('matches')
    .select('round, team_a_id, team_b_id')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const existingMatches: CustomAutoMatch[] = (existingMatchesRaw ?? [])
    .filter((m) => m.team_b_id !== null)
    .map((m) => ({ round: m.round, teamAId: m.team_a_id!, teamBId: m.team_b_id! }));

  const nextRound =
    existingMatches.length > 0 ? Math.max(...existingMatches.map((m) => m.round)) + 1 : 1;

  const targetRounds = tournament?.custom_rounds ?? 5;
  if (nextRound > targetRounds) {
    throw new Error(`All ${targetRounds} round${targetRounds === 1 ? '' : 's'} already have matches.`);
  }

  const pairings = computeCustomAutoRound(teams, existingMatches, nextRound);

  const { error: insertError } = await supabase.from('matches').insert(
    assignCourts(
      pairings.map((p) => ({
        tournament_id: tournamentId,
        round: nextRound,
        stage: 'league' as const,
        team_a_id: p.teamAId,
        team_b_id: p.teamBId,
        status: 'pending' as const,
      }))
    )
  );

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

Replace the whole function with:

```ts
export async function autoGenerateCustomRound(tournamentId: string) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Auto-generate is only available for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to auto-generate a round.');
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (playersError) {
    throw new Error(playersError.message);
  }

  const playerIds = (players ?? []).map((p) => p.id);
  const isOddMode = playerIds.length % 2 === 1;

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, player_1_id, player_2_id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (!isOddMode && (!teams || teams.length < 2)) {
    throw new Error('Need at least 2 teams to auto-generate a round.');
  }
  if (isOddMode && playerIds.length < 4) {
    throw new Error('Need at least 4 players to auto-generate a round.');
  }

  const { data: existingMatchesRaw, error: matchesError } = await supabase
    .from('matches')
    .select('round, team_a_id, team_b_id')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league');

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const existingMatches: CustomAutoMatch[] = (existingMatchesRaw ?? [])
    .filter((m) => m.team_b_id !== null)
    .map((m) => ({ round: m.round, teamAId: m.team_a_id!, teamBId: m.team_b_id! }));

  const nextRound =
    existingMatches.length > 0 ? Math.max(...existingMatches.map((m) => m.round)) + 1 : 1;

  const targetRounds = tournament?.custom_rounds ?? 5;
  if (nextRound > targetRounds) {
    throw new Error(`All ${targetRounds} round${targetRounds === 1 ? '' : 's'} already have matches.`);
  }

  type MatchRow = {
    tournament_id: string;
    round: number;
    stage: 'league';
    team_a_id: string;
    team_b_id: string;
    status: 'pending';
  };
  let matchRows: MatchRow[];

  if (isOddMode) {
    const teamIdByPairKey = new Map<string, string>();
    for (const t of teams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }

    const history = derivePlayerHistory(
      playerIds,
      existingMatches,
      (teams ?? []).map((t) => ({ id: t.id, player1Id: t.player_1_id, player2Id: t.player_2_id })),
      nextRound
    );
    const pairings = computeCustomDynamicRound(playerIds, history);

    const pairKeysNeeded = new Set<string>();
    for (const p of pairings) {
      pairKeysNeeded.add(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]));
      pairKeysNeeded.add(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]));
    }
    const newPairKeys = [...pairKeysNeeded].filter((key) => !teamIdByPairKey.has(key));

    if (newPairKeys.length > 0) {
      const { data: insertedTeams, error: insertTeamsError } = await supabase
        .from('teams')
        .insert(
          newPairKeys.map((key) => {
            const [player1Id, player2Id] = key.split('|');
            return { tournament_id: tournamentId, player_1_id: player1Id, player_2_id: player2Id };
          })
        )
        .select('id, player_1_id, player_2_id');

      if (insertTeamsError) {
        throw new Error(insertTeamsError.message);
      }

      for (const t of insertedTeams ?? []) {
        teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
      }
    }

    matchRows = pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }));
  } else {
    const pairings = computeCustomAutoRound(teams ?? [], existingMatches, nextRound);
    matchRows = pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }));
  }

  const { error: insertError } = await supabase.from('matches').insert(assignCourts(matchRows));

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

Note: `derivePlayerHistory` is called with `existingMatches` directly — `CustomAutoMatch` (`{ round, teamAId, teamBId }`) already matches the `{ round: number; teamAId: string; teamBId: string }[]` shape `derivePlayerHistory` expects, so no remapping is needed.

- [ ] **Step 3: Verify**

Run: `npm test` (from `apps/organizer-web`) — expect all existing tests still pass (this file has no test file of its own — see Global Constraints; `customAuto.test.ts`, `customPlayerHistory.test.ts`, and `customDynamic.test.ts` are unaffected).
Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build.

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: branch autoGenerateCustomRound to dynamic pairing on odd player count"
```

---

### Task 4: Wire `addCustomMatch` to branch even/odd

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: the existing private `pairKey` helper already in this file (no new import needed — Task 3 already added the two new imports this file needs).

- [ ] **Step 1: Replace `addCustomMatch`**

The function currently reads (exact current text):

```ts
export async function addCustomMatch(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Matches can only be added manually for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to add a match.');
  }

  const targetRounds = tournament?.custom_rounds ?? 5;
  const roundRaw = formData.get('round');
  const round = typeof roundRaw === 'string' ? Number(roundRaw) : NaN;

  if (!Number.isInteger(round) || round < 1 || round > targetRounds) {
    throw new Error(`Round must be a whole number between 1 and ${targetRounds}`);
  }

  const teamAId = formData.get('teamAId');
  const teamBId = formData.get('teamBId');

  if (typeof teamAId !== 'string' || typeof teamBId !== 'string' || !teamAId || !teamBId) {
    throw new Error('Both teams must be selected');
  }

  if (teamAId === teamBId) {
    throw new Error('Team A and Team B must be different teams');
  }

  const { data: validTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .in('id', [teamAId, teamBId]);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const validIds = new Set((validTeams ?? []).map((t) => t.id));
  if (!validIds.has(teamAId) || !validIds.has(teamBId)) {
    throw new Error('Selected teams must belong to this tournament');
  }

  const { count: existingInRound, error: existingInRoundError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league')
    .eq('round', round);

  if (existingInRoundError) {
    throw new Error(existingInRoundError.message);
  }

  const { error } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round,
    stage: 'league' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
    court: courtForIndex(existingInRound ?? 0),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

Replace the whole function with:

```ts
export async function addCustomMatch(tournamentId: string, formData: FormData) {
  const { supabase } = await requireOrganizer();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('format, custom_rounds, completed_at, results_unlocked_at')
    .eq('id', tournamentId)
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (tournament?.format !== 'custom') {
    throw new Error('Matches can only be added manually for the Custom League format.');
  }

  if (!canEditScore(tournament?.completed_at ?? null, tournament?.results_unlocked_at ?? null)) {
    throw new Error('Scores are locked — unlock editing first to add a match.');
  }

  const targetRounds = tournament?.custom_rounds ?? 5;
  const roundRaw = formData.get('round');
  const round = typeof roundRaw === 'string' ? Number(roundRaw) : NaN;

  if (!Number.isInteger(round) || round < 1 || round > targetRounds) {
    throw new Error(`Round must be a whole number between 1 and ${targetRounds}`);
  }

  const { data: players, error: playersCountError } = await supabase
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId);

  if (playersCountError) {
    throw new Error(playersCountError.message);
  }

  const isOddMode = (players ?? []).length % 2 === 1;

  let teamAId: string;
  let teamBId: string;

  if (isOddMode) {
    const teamAPlayer1 = formData.get('teamAPlayer1Id');
    const teamAPlayer2 = formData.get('teamAPlayer2Id');
    const teamBPlayer1 = formData.get('teamBPlayer1Id');
    const teamBPlayer2 = formData.get('teamBPlayer2Id');

    if (
      typeof teamAPlayer1 !== 'string' ||
      !teamAPlayer1 ||
      typeof teamAPlayer2 !== 'string' ||
      !teamAPlayer2 ||
      typeof teamBPlayer1 !== 'string' ||
      !teamBPlayer1 ||
      typeof teamBPlayer2 !== 'string' ||
      !teamBPlayer2
    ) {
      throw new Error('All 4 players must be selected');
    }

    const selectedPlayerIds = [teamAPlayer1, teamAPlayer2, teamBPlayer1, teamBPlayer2];
    if (new Set(selectedPlayerIds).size !== 4) {
      throw new Error('All 4 selected players must be different');
    }

    const { data: validPlayers, error: validPlayersError } = await supabase
      .from('players')
      .select('id')
      .eq('tournament_id', tournamentId)
      .in('id', selectedPlayerIds);

    if (validPlayersError) {
      throw new Error(validPlayersError.message);
    }

    const validPlayerIds = new Set((validPlayers ?? []).map((p) => p.id));
    if (selectedPlayerIds.some((pid) => !validPlayerIds.has(pid))) {
      throw new Error('Selected players must belong to this tournament');
    }

    const { data: roundMatches, error: roundMatchesError } = await supabase
      .from('matches')
      .select('team_a_id, team_b_id')
      .eq('tournament_id', tournamentId)
      .eq('stage', 'league')
      .eq('round', round);

    if (roundMatchesError) {
      throw new Error(roundMatchesError.message);
    }

    const busyTeamIds = new Set(
      (roundMatches ?? []).flatMap((m) =>
        [m.team_a_id, m.team_b_id].filter((tid): tid is string => tid !== null)
      )
    );

    if (busyTeamIds.size > 0) {
      const { data: busyTeams, error: busyTeamsError } = await supabase
        .from('teams')
        .select('player_1_id, player_2_id')
        .in('id', [...busyTeamIds]);

      if (busyTeamsError) {
        throw new Error(busyTeamsError.message);
      }

      const busyPlayerIds = new Set((busyTeams ?? []).flatMap((t) => [t.player_1_id, t.player_2_id]));

      if (selectedPlayerIds.some((pid) => busyPlayerIds.has(pid))) {
        throw new Error('One of the selected players is already in a match this round');
      }
    }

    const { data: existingTeams, error: existingTeamsError } = await supabase
      .from('teams')
      .select('id, player_1_id, player_2_id')
      .eq('tournament_id', tournamentId);

    if (existingTeamsError) {
      throw new Error(existingTeamsError.message);
    }

    const teamIdByPairKey = new Map<string, string>();
    for (const t of existingTeams ?? []) {
      teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
    }

    const neededPairs: [string, string][] = [
      [teamAPlayer1, teamAPlayer2],
      [teamBPlayer1, teamBPlayer2],
    ];
    const newPairKeys = neededPairs.map(([a, b]) => pairKey(a, b)).filter((key) => !teamIdByPairKey.has(key));

    if (newPairKeys.length > 0) {
      const { data: insertedTeams, error: insertTeamsError } = await supabase
        .from('teams')
        .insert(
          newPairKeys.map((key) => {
            const [player1Id, player2Id] = key.split('|');
            return { tournament_id: tournamentId, player_1_id: player1Id, player_2_id: player2Id };
          })
        )
        .select('id, player_1_id, player_2_id');

      if (insertTeamsError) {
        throw new Error(insertTeamsError.message);
      }

      for (const t of insertedTeams ?? []) {
        teamIdByPairKey.set(pairKey(t.player_1_id, t.player_2_id), t.id);
      }
    }

    teamAId = teamIdByPairKey.get(pairKey(teamAPlayer1, teamAPlayer2))!;
    teamBId = teamIdByPairKey.get(pairKey(teamBPlayer1, teamBPlayer2))!;
  } else {
    const teamAIdRaw = formData.get('teamAId');
    const teamBIdRaw = formData.get('teamBId');

    if (typeof teamAIdRaw !== 'string' || typeof teamBIdRaw !== 'string' || !teamAIdRaw || !teamBIdRaw) {
      throw new Error('Both teams must be selected');
    }

    if (teamAIdRaw === teamBIdRaw) {
      throw new Error('Team A and Team B must be different teams');
    }

    const { data: validTeams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('tournament_id', tournamentId)
      .in('id', [teamAIdRaw, teamBIdRaw]);

    if (teamsError) {
      throw new Error(teamsError.message);
    }

    const validIds = new Set((validTeams ?? []).map((t) => t.id));
    if (!validIds.has(teamAIdRaw) || !validIds.has(teamBIdRaw)) {
      throw new Error('Selected teams must belong to this tournament');
    }

    teamAId = teamAIdRaw;
    teamBId = teamBIdRaw;
  }

  const { count: existingInRound, error: existingInRoundError } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('stage', 'league')
    .eq('round', round);

  if (existingInRoundError) {
    throw new Error(existingInRoundError.message);
  }

  const { error } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round,
    stage: 'league' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
    court: courtForIndex(existingInRound ?? 0),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/tournaments/${tournamentId}/bracket`);
}
```

- [ ] **Step 2: Verify**

Run: `npm test` (from `apps/organizer-web`) — expect all existing tests still pass.
Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build.

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: branch addCustomMatch to player-based selection on odd player count"
```

---

### Task 5: Bracket page — odd-mode "Add Match" form

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: nothing new from Tasks 1-4 (pure UI change) — the form field names `teamAPlayer1Id`/`teamAPlayer2Id`/`teamBPlayer1Id`/`teamBPlayer2Id` must match exactly what Task 4's `addCustomMatch` reads from `formData`.

- [ ] **Step 1: Add `isOddMode`**

The file currently has, near the top of the component body:

```ts
  const teamCount = (teams ?? []).length;
  const playerCount = (players ?? []).length;
```

Change to:

```ts
  const teamCount = (teams ?? []).length;
  const playerCount = (players ?? []).length;
  const isOddMode = playerCount % 2 === 1;
```

- [ ] **Step 2: Replace the "Add Match" card**

The card currently reads (exact current text):

```tsx
      {isCustom && canEditScoreValue && (
        <div className={`${actionCardClass} mb-6`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-1">
            Add Match
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Target: {customTargetRounds} round{customTargetRounds === 1 ? '' : 's'} — highest
            round added so far: {currentCustomMaxRound || 'none yet'}.
          </p>
          {teamCount < 2 ? (
            <p className="text-sm text-red-700">
              Need at least 2 teams before you can add a match — go back and pair more teams
              first.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-3">
                Full round-robin coverage for {teamCount} team{teamCount === 1 ? '' : 's'} needs{' '}
                {customFullCoverageRoundsValue} round{customFullCoverageRoundsValue === 1 ? '' : 's'}.
              </p>
              {currentCustomMaxRound < customTargetRounds && (
                <form action={autoGenerateCustomRoundWithId} className="mb-4">
                  <SaveButton className={accentButtonClass} pendingLabel="Generating…">
                    Auto-generate Round {currentCustomMaxRound + 1}
                  </SaveButton>
                </form>
              )}
              <form action={addCustomMatchWithId} className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
                  <input
                    name="round"
                    type="number"
                    defaultValue={1}
                    min={1}
                    max={customTargetRounds}
                    required
                    className={`${inputClass} w-20`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Team A</label>
                  <select name="teamAId" defaultValue="" required className={inputClass}>
                    <option value="" disabled>
                      Select team
                    </option>
                    {(teams ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamById.get(t.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-slate-400 font-bold pb-2">vs</span>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Team B</label>
                  <select name="teamBId" defaultValue="" required className={inputClass}>
                    <option value="" disabled>
                      Select team
                    </option>
                    {(teams ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamById.get(t.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <SaveButton className={accentButtonClass} pendingLabel="Adding…">
                  Add Match
                </SaveButton>
              </form>
            </>
          )}
        </div>
      )}
```

Replace the whole block with:

```tsx
      {isCustom && canEditScoreValue && (
        <div className={`${actionCardClass} mb-6`}>
          <h2 className="text-sm font-bold text-navy-mid uppercase tracking-wide mb-1">
            Add Match
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Target: {customTargetRounds} round{customTargetRounds === 1 ? '' : 's'} — highest
            round added so far: {currentCustomMaxRound || 'none yet'}.
          </p>
          {isOddMode && (
            <p className="text-xs text-navy-mid bg-navy-tint rounded-lg px-3 py-2 mb-3">
              Odd number of players — matches are paired by individual player instead of saved
              teams until the count is even again.
            </p>
          )}
          {(isOddMode ? playerCount < 4 : teamCount < 2) ? (
            <p className="text-sm text-red-700">
              {isOddMode
                ? 'Need at least 4 players before you can add a match.'
                : 'Need at least 2 teams before you can add a match — go back and pair more teams first.'}
            </p>
          ) : (
            <>
              {!isOddMode && (
                <p className="text-xs text-slate-400 mb-3">
                  Full round-robin coverage for {teamCount} team{teamCount === 1 ? '' : 's'} needs{' '}
                  {customFullCoverageRoundsValue} round{customFullCoverageRoundsValue === 1 ? '' : 's'}.
                </p>
              )}
              {currentCustomMaxRound < customTargetRounds && (
                <form action={autoGenerateCustomRoundWithId} className="mb-4">
                  <SaveButton className={accentButtonClass} pendingLabel="Generating…">
                    Auto-generate Round {currentCustomMaxRound + 1}
                  </SaveButton>
                </form>
              )}
              <form action={addCustomMatchWithId} className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
                  <input
                    name="round"
                    type="number"
                    defaultValue={1}
                    min={1}
                    max={customTargetRounds}
                    required
                    className={`${inputClass} w-20`}
                  />
                </div>
                {isOddMode ? (
                  <>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team A — Player 1
                        </label>
                        <select name="teamAPlayer1Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team A — Player 2
                        </label>
                        <select name="teamAPlayer2Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <span className="text-slate-400 font-bold pb-2">vs</span>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team B — Player 1
                        </label>
                        <select name="teamBPlayer1Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          Team B — Player 2
                        </label>
                        <select name="teamBPlayer2Id" defaultValue="" required className={inputClass}>
                          <option value="" disabled>
                            Select player
                          </option>
                          {(players ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Team A</label>
                      <select name="teamAId" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Select team
                        </option>
                        {(teams ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamById.get(t.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="text-slate-400 font-bold pb-2">vs</span>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Team B</label>
                      <select name="teamBId" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Select team
                        </option>
                        {(teams ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {teamById.get(t.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <SaveButton className={accentButtonClass} pendingLabel="Adding…">
                  Add Match
                </SaveButton>
              </form>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 3: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build (this page has no test file — see Global Constraints).

- [ ] **Step 4: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: show player-based Add Match form on odd player count"
```

---

### Task 6: Teams page — odd-count note

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/teams/page.tsx`

**Interfaces:** none — self-contained UI addition.

- [ ] **Step 1: Add the note**

The file currently has, right after the header block:

```tsx
      {isLeaguePlayoffs && hasLeagueMatches && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          This tournament already has a generated schedule. Removing a team also deletes its
          existing matches and their scores. After changing teams, head to Bracket and use
          Regenerate All Rounds to rebuild a clean schedule from the current team list.
        </div>
      )}

      {isAutoPaired ? (
```

Insert a new conditional block between them:

```tsx
      {isLeaguePlayoffs && hasLeagueMatches && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">
          This tournament already has a generated schedule. Removing a team also deletes its
          existing matches and their scores. After changing teams, head to Bracket and use
          Regenerate All Rounds to rebuild a clean schedule from the current team list.
        </div>
      )}

      {tournament?.format === 'custom' && (players ?? []).length % 2 === 1 && (
        <div className="rounded-lg bg-navy-tint border border-navy-mid/25 text-navy-deep text-sm px-4 py-3 mb-6">
          Odd number of players signed up — the extra player won&apos;t be stuck on the bench.
          Matches generated while the count is odd pair players directly instead of using the
          teams below, so everyone still gets games.
        </div>
      )}

      {isAutoPaired ? (
```

- [ ] **Step 2: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build (this page has no test file — see Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/teams/page.tsx"
git commit -m "feat: note odd player count on Teams page for Custom League"
```

---

## After all tasks

Run the full suite once more from `apps/organizer-web`: `npm test && npm run build`. Then do one live check with the dev server (`organizer-web` launch config, port 3000): create a Custom League tournament with an odd number of players, confirm "Auto-generate Round 1" pairs everyone (nobody left unpaired), confirm the "Add Match" form shows 4 player selects instead of 2 team selects, add a player to make the count even and confirm the next generated round reverts to fixed-team behavior, and confirm the Teams page shows the odd-count note only while the count is actually odd.
