# Court Assignment for Generated Matches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every generated match in every non-ladder tournament format gets a physical court number (1-4, cycling), and organizers/players see it labeled "Centre Court" / "Court 2" / "Court 3" / "Court 4".

**Architecture:** One new pure, unit-tested module (`lib/tournament/courts.ts`) provides the cycling/labeling logic. Every batch match-insert call site in `bracket/actions.ts` wraps its row-mapping in the module's `assignCourts()` helper; the one single-row manual-add site computes its court directly via `courtForIndex()`. A small pre-existing duplication (`isLadderFormat` boolean re-derived identically in three files) is extracted into `formats.ts` as part of this work, since two more call sites (the two display pages) need the same check. Two display surfaces (organizer bracket page, public league page) render the new label for non-ladder matches only.

**Tech Stack:** Next.js Server Actions (Supabase), TypeScript, Vitest.

## Global Constraints

- Court count is a single global constant: `NUM_COURTS = 4`. Not venue-specific (spec §Scope decisions).
- Court 1 labels as **"Centre Court"**; courts 2-4 label as **"Court 2"**, **"Court 3"**, **"Court 4"**.
- Overflow: when a round has more matches than courts, court numbers **cycle** back to 1 (match index 4 → Court 1 again), not left blank.
- **Ladder formats** (`claim_the_throne`, `up_and_down_the_river`) are explicitly out of scope. Their `court` column already means ranking tier — do not change their insert logic, their `court` values, or their existing `C{n}` display.
- `cream_of_the_crop` is a format label listed in `lib/tournament/formats.ts` with **no generator or insertion code anywhere in the codebase** (verified: it appears in exactly one file, the label list). Nothing to change for it — do not add code for a format that has no implementation.
- No database migration needed — `matches.court` is already a nullable `integer` column.
- **Testing convention (established, not introduced by this plan):** `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts` (a `'use server'` file) and every `page.tsx` in this app have **zero existing test coverage** anywhere in the codebase — confirmed by searching for `*.test.ts`/`*.test.tsx` siblings of every `'use server'` file and every `page.tsx`. Only pure functions under `lib/tournament/*.ts` get Vitest unit tests. Tasks touching `actions.ts` or a `page.tsx` must **not** invent new test files for them — verify those changes via `npm run build` (typecheck, from `apps/organizer-web`) and `npm test` (no regressions) only. This is not a coverage gap to fix; it is the codebase's existing convention (confirmed against `.github/workflows/ci.yml`, which runs exactly `npm test` then `npm run build`).
- Test command: `npm test` (Vitest) from `apps/organizer-web`. Build/typecheck: `npm run build` from `apps/organizer-web`.

---

### Task 1: `lib/tournament/courts.ts` — cycling and labeling helpers

**Files:**
- Create: `apps/organizer-web/lib/tournament/courts.ts`
- Test: `apps/organizer-web/lib/tournament/courts.test.ts`

**Interfaces:**
- Produces: `NUM_COURTS: number` (= 4), `courtForIndex(index: number, numCourts?: number): number`, `courtLabel(court: number): string`, `assignCourts<T>(rows: T[]): (T & { court: number })[]` — all used by Tasks 3, 4, 5, 6.

- [ ] **Step 1: Write the failing tests**

Create `apps/organizer-web/lib/tournament/courts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NUM_COURTS, courtForIndex, courtLabel, assignCourts } from './courts';

describe('courtForIndex', () => {
  it('maps indices 0-3 to courts 1-4', () => {
    expect(courtForIndex(0)).toBe(1);
    expect(courtForIndex(1)).toBe(2);
    expect(courtForIndex(2)).toBe(3);
    expect(courtForIndex(3)).toBe(4);
  });

  it('wraps back to court 1 at index 4', () => {
    expect(courtForIndex(4)).toBe(1);
  });

  it('wraps to court 4 at index 7 (second lap, last court)', () => {
    expect(courtForIndex(7)).toBe(4);
  });

  it('respects a custom numCourts', () => {
    expect(courtForIndex(2, 2)).toBe(1);
    expect(courtForIndex(3, 2)).toBe(2);
  });

  it('exposes NUM_COURTS as 4', () => {
    expect(NUM_COURTS).toBe(4);
  });
});

describe('courtLabel', () => {
  it('labels court 1 as Centre Court', () => {
    expect(courtLabel(1)).toBe('Centre Court');
  });

  it('labels courts 2-4 as "Court n"', () => {
    expect(courtLabel(2)).toBe('Court 2');
    expect(courtLabel(3)).toBe('Court 3');
    expect(courtLabel(4)).toBe('Court 4');
  });
});

describe('assignCourts', () => {
  it("preserves each row's original fields", () => {
    const rows = [
      { teamAId: 'a', teamBId: 'b' },
      { teamAId: 'c', teamBId: 'd' },
    ];
    const result = assignCourts(rows);
    expect(result[0]).toMatchObject({ teamAId: 'a', teamBId: 'b' });
    expect(result[1]).toMatchObject({ teamAId: 'c', teamBId: 'd' });
  });

  it('assigns court in array order matching courtForIndex, wrapping past 4', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: i }));
    const result = assignCourts(rows);
    expect(result.map((r) => r.court)).toEqual([1, 2, 3, 4, 1, 2]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/organizer-web`): `npx vitest run lib/tournament/courts.test.ts`
Expected: FAIL — `Cannot find module './courts'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/organizer-web/lib/tournament/courts.ts`:

```ts
// Pickleturf has exactly 4 physical courts. This module is the "which physical court is
// this match played on" semantic -- distinct from claimTheThrone.ts / upAndDownTheRiver.ts,
// where the matches table's `court` column instead means ladder ranking tier for those two
// formats. See docs/superpowers/specs/2026-08-24-court-assignment-design.md.
export const NUM_COURTS = 4;

// 0-based index -> 1-based court number, cycling every numCourts. Used so a round with more
// matches than courts (e.g. 10 teams -> 5 simultaneous matches vs. 4 courts) wraps back to
// Court 1 instead of leaving overflow matches courtless.
export function courtForIndex(index: number, numCourts: number = NUM_COURTS): number {
  return (index % numCourts) + 1;
}

export function courtLabel(court: number): string {
  return court === 1 ? 'Centre Court' : `Court ${court}`;
}

// Attaches `court` to each row in array order via courtForIndex. Row order is the caller's
// play order for the round (whatever order the pairing array is already in).
export function assignCourts<T>(rows: T[]): (T & { court: number })[] {
  return rows.map((row, i) => ({ ...row, court: courtForIndex(i) }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tournament/courts.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer-web/lib/tournament/courts.ts apps/organizer-web/lib/tournament/courts.test.ts
git commit -m "feat: add court cycling and labeling helpers"
```

---

### Task 2: Shared `isLadderFormat` helper (DRY extraction)

**Files:**
- Modify: `apps/organizer-web/lib/tournament/formats.ts`
- Create: `apps/organizer-web/lib/tournament/formats.test.ts`
- Modify: `apps/organizer-web/lib/tournament/champion.ts`
- Modify: `apps/organizer-web/app/tournaments/[id]/results/page.tsx`
- Modify: `apps/organizer-web/app/tournaments/[id]/standings/page.tsx`

**Interfaces:**
- Produces: `isLadderFormat(format: string): boolean` from `formats.ts`, used by this task's three call sites and by Tasks 5 and 6.
- Pure refactor — no behavior change. `champion.test.ts` (existing) must still pass unchanged.

- [ ] **Step 1: Write the failing test**

Create `apps/organizer-web/lib/tournament/formats.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tournament/formats.test.ts`
Expected: FAIL — `isLadderFormat` is not exported from `./formats`.

- [ ] **Step 3: Add `isLadderFormat` to `formats.ts`**

In `apps/organizer-web/lib/tournament/formats.ts`, the file currently ends with:

```ts
export function isIndividualFormat(format: string): boolean {
  return INDIVIDUAL_FORMATS.includes(format);
}
```

Append after it:

```ts

const LADDER_FORMATS: readonly string[] = ['claim_the_throne', 'up_and_down_the_river'];

export function isLadderFormat(format: string): boolean {
  return LADDER_FORMATS.includes(format);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tournament/formats.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Swap the inline derivation in `champion.ts`**

In `apps/organizer-web/lib/tournament/champion.ts`, change the import:

```ts
import { isIndividualFormat } from './formats';
```
to:
```ts
import { isIndividualFormat, isLadderFormat as isLadderFormatCheck } from './formats';
```

Then change:
```ts
  const isLadderFormat = format === 'claim_the_throne' || format === 'up_and_down_the_river';
```
to:
```ts
  const isLadderFormat = isLadderFormatCheck(format);
```

(Every later use of the local `isLadderFormat` variable in this file is unchanged — only its derivation moved.)

- [ ] **Step 6: Swap the inline derivation in `results/page.tsx`**

In `apps/organizer-web/app/tournaments/[id]/results/page.tsx`, change the import:

```ts
import { formatLabel, isIndividualFormat as isIndividualFormatCheck } from '@/lib/tournament/formats';
```
to:
```ts
import { formatLabel, isIndividualFormat as isIndividualFormatCheck, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
```

Then change:
```ts
  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
  const isClaimTheThrone = tournament.format === 'claim_the_throne';
  const isUpAndDownRiver = tournament.format === 'up_and_down_the_river';
  const isLadderFormat = isClaimTheThrone || isUpAndDownRiver;
```
to:
```ts
  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
  const isLadderFormat = isLadderFormatCheck(tournament.format);
```

(`isClaimTheThrone` / `isUpAndDownRiver` are not referenced anywhere else in this file — safe to remove.)

- [ ] **Step 7: Swap the inline derivation in `standings/page.tsx`**

In `apps/organizer-web/app/tournaments/[id]/standings/page.tsx`, change the import:

```ts
import { isIndividualFormat as isIndividualFormatCheck } from '@/lib/tournament/formats';
```
to:
```ts
import { isIndividualFormat as isIndividualFormatCheck, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
```

Then change:
```ts
  const isClaimTheThrone = tournament?.format === 'claim_the_throne';
  const isUpAndDownRiver = tournament?.format === 'up_and_down_the_river';
  const isLadderFormat = isClaimTheThrone || isUpAndDownRiver;
```
to:
```ts
  const isLadderFormat = isLadderFormatCheck(tournament?.format ?? '');
```

(`isClaimTheThrone` / `isUpAndDownRiver` are not referenced anywhere else in this file — safe to remove.)

- [ ] **Step 8: Verify no regressions**

Run: `npm test` (from `apps/organizer-web`)
Expected: all existing tests pass, including `champion.test.ts` unchanged.

Run: `npm run build` (from `apps/organizer-web`)
Expected: builds with no TypeScript errors (confirms `results/page.tsx` and `standings/page.tsx` still typecheck — these two files have no test files, per Global Constraints).

- [ ] **Step 9: Commit**

```bash
git add apps/organizer-web/lib/tournament/formats.ts apps/organizer-web/lib/tournament/formats.test.ts apps/organizer-web/lib/tournament/champion.ts "apps/organizer-web/app/tournaments/[id]/results/page.tsx" "apps/organizer-web/app/tournaments/[id]/standings/page.tsx"
git commit -m "refactor: extract shared isLadderFormat helper"
```

---

### Task 3: Wire court assignment into round_robin / double_header / league_playoffs

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `assignCourts<T>(rows: T[]): (T & { court: number })[]` and `courtForIndex(index: number, numCourts?: number): number` from `@/lib/tournament/courts` (Task 1).
- Produces: the `assignCourts`/`courtForIndex` import in this file, reused by Task 4 (no re-import needed there).

- [ ] **Step 1: Add the import**

In `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`, the imports currently include:

```ts
import { computeStandings } from '@/lib/tournament/standings';
import { canEditScore, canEditTeams } from '@/lib/tournament/completion';
```

Insert a new import between them:

```ts
import { computeStandings } from '@/lib/tournament/standings';
import { assignCourts, courtForIndex } from '@/lib/tournament/courts';
import { canEditScore, canEditTeams } from '@/lib/tournament/completion';
```

- [ ] **Step 2: Wrap the shared round_robin/league_playoffs insert (3 identical call sites)**

`generateBracket`, `generateLeaguePlayoffsBracket`, and `regenerateLeaguePlayoffsBracket` each contain this **exact, byte-for-byte identical** block:

```ts
  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );
```

Replace **all three occurrences** with:

```ts
  const { error: matchesError } = await supabase.from('matches').insert(
    assignCourts(
      pairings.map((p) => ({
        tournament_id: tournamentId,
        round: p.round,
        stage: 'league' as const,
        team_a_id: p.teamAId,
        team_b_id: p.teamBId,
        status: 'pending' as const,
      }))
    )
  );
```

(Use a single find-and-replace-all across the file for this exact block — it is not unique to one function, and the replacement is identical in all three places.)

- [ ] **Step 3: Wrap the semifinal insert**

In `generateSemifinalMatches`, change:

```ts
  const { error: insertError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: 1,
      stage: 'semifinal' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );
```
to:
```ts
  const { error: insertError } = await supabase.from('matches').insert(
    assignCourts(
      pairings.map((p) => ({
        tournament_id: tournamentId,
        round: 1,
        stage: 'semifinal' as const,
        team_a_id: p.teamAId,
        team_b_id: p.teamBId,
        status: 'pending' as const,
      }))
    )
  );
```

- [ ] **Step 4: Assign a court to the single-match `skipToFinalMatch` insert**

In `skipToFinalMatch`, change:

```ts
  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
  });
```
to:
```ts
  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
    court: courtForIndex(0),
  });
```

- [ ] **Step 5: Assign a court to the single-match `generateFinalMatch` insert**

In `generateFinalMatch`, change:

```ts
  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: winners[0],
    team_b_id: winners[1],
    status: 'pending' as const,
  });
```
to:
```ts
  const { error: insertError } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round: 1,
    stage: 'final' as const,
    team_a_id: winners[0],
    team_b_id: winners[1],
    status: 'pending' as const,
    court: courtForIndex(0),
  });
```

- [ ] **Step 6: Verify**

Run: `npm test` (from `apps/organizer-web`) — expect all existing tests still pass (this file has no test file of its own — see Global Constraints).
Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build.

- [ ] **Step 7: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: assign courts for round_robin, double_header, and league_playoffs matches"
```

---

### Task 4: Wire court assignment into popcorn / gauntlet / custom

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts`

**Interfaces:**
- Consumes: `assignCourts`, `courtForIndex` — already imported into this file by Task 3.

- [ ] **Step 1: Wrap the Popcorn insert**

In `generatePopcornBracket`, change:

```ts
  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: p.round,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }))
  );
```
to:
```ts
  const { error: matchesError } = await supabase.from('matches').insert(
    assignCourts(
      pairings.map((p) => ({
        tournament_id: tournamentId,
        round: p.round,
        stage: 'league' as const,
        team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
        team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
        status: 'pending' as const,
      }))
    )
  );
```

- [ ] **Step 2: Wrap the Gauntlet insert**

In `advanceGauntletRound`, change:

```ts
  const { error: matchesError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
      team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
      status: 'pending' as const,
    }))
  );
```
to:
```ts
  const { error: matchesError } = await supabase.from('matches').insert(
    assignCourts(
      pairings.map((p) => ({
        tournament_id: tournamentId,
        round: nextRound,
        stage: 'league' as const,
        team_a_id: teamIdByPairKey.get(pairKey(p.teamAPlayerIds[0], p.teamAPlayerIds[1]))!,
        team_b_id: teamIdByPairKey.get(pairKey(p.teamBPlayerIds[0], p.teamBPlayerIds[1]))!,
        status: 'pending' as const,
      }))
    )
  );
```

- [ ] **Step 3: Wrap the Custom auto-generate insert**

In `autoGenerateCustomRound`, change:

```ts
  const { error: insertError } = await supabase.from('matches').insert(
    pairings.map((p) => ({
      tournament_id: tournamentId,
      round: nextRound,
      stage: 'league' as const,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      status: 'pending' as const,
    }))
  );
```
to:
```ts
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
```

- [ ] **Step 4: Assign a court to the single manual `addCustomMatch` insert**

`addCustomMatch` inserts exactly one match at a time into a round that may already have matches, so it cannot use `assignCourts` (which expects a full round's array). Instead, count how many matches already exist in that round and use that count as the index.

In `addCustomMatch`, the insert currently reads:

```ts
  const { error } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    round,
    stage: 'league' as const,
    team_a_id: teamAId,
    team_b_id: teamBId,
    status: 'pending' as const,
  });
```

Change it to query the existing count first, then include `court`:

```ts
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
```

- [ ] **Step 5: Verify**

Run: `npm test` (from `apps/organizer-web`) — expect all existing tests still pass.
Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build.

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: assign courts for popcorn, gauntlet, and custom league matches"
```

---

### Task 5: Organizer bracket page — labeled court badge

**Files:**
- Modify: `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`

**Interfaces:**
- Consumes: `isLadderFormat(format: string): boolean` from `@/lib/tournament/formats` (Task 2), `courtLabel(court: number): string` from `@/lib/tournament/courts` (Task 1).

- [ ] **Step 1: Add imports**

In `apps/organizer-web/app/tournaments/[id]/bracket/page.tsx`, change:

```ts
import { formatLabel } from '@/lib/tournament/formats';
```
to:
```ts
import { formatLabel, isLadderFormat as isLadderFormatCheck } from '@/lib/tournament/formats';
import { courtLabel } from '@/lib/tournament/courts';
```

- [ ] **Step 2: Compute `isLadderFormat` alongside the existing format flags**

The component already computes, near the top of the function body:

```ts
  const isClaimTheThrone = format === 'claim_the_throne';
  const isUpAndDownRiver = format === 'up_and_down_the_river';
  const isCustom = format === 'custom';
```

Change to (adding one line, keeping the other two — they're still used elsewhere in this file for button rendering):

```ts
  const isClaimTheThrone = format === 'claim_the_throne';
  const isUpAndDownRiver = format === 'up_and_down_the_river';
  const isLadderFormat = isLadderFormatCheck(format);
  const isCustom = format === 'custom';
```

- [ ] **Step 3: Make the court badge format-aware**

The match-list renderer currently has:

```tsx
                  {m.court !== null && (
                    <span className="text-xs font-bold text-slate-400">C{m.court}</span>
                  )}
```

Change to:

```tsx
                  {m.court !== null && (
                    <span className="text-xs font-bold text-slate-400">
                      {isLadderFormat ? `C${m.court}` : courtLabel(m.court)}
                    </span>
                  )}
```

(`renderMatchList` is a closure defined inside the page component, so `isLadderFormat` from Step 2 is already in scope — no parameter changes needed.)

- [ ] **Step 4: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build (this page has no test file — see Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add "apps/organizer-web/app/tournaments/[id]/bracket/page.tsx"
git commit -m "feat: show labeled court badge on organizer bracket page for non-ladder formats"
```

---

### Task 6: Public league page — court badge

**Files:**
- Modify: `apps/organizer-web/app/t/[id]/page.tsx`

**Interfaces:**
- Consumes: `isLadderFormat(format: string): boolean` from `@/lib/tournament/formats` (Task 2), `courtLabel(court: number): string` from `@/lib/tournament/courts` (Task 1).

- [ ] **Step 1: Add imports**

In `apps/organizer-web/app/t/[id]/page.tsx`, change:

```ts
import { isRosterFull, slotsRemaining } from '@/lib/tournament/capacity';
```
to:
```ts
import { isRosterFull, slotsRemaining } from '@/lib/tournament/capacity';
import { isLadderFormat } from '@/lib/tournament/formats';
import { courtLabel } from '@/lib/tournament/courts';
```

- [ ] **Step 2: Select the `court` column**

Change:

```ts
  const { data: matches } = await supabase
    .from('matches')
    .select('round, stage, team_a_id, team_b_id, score_a, score_b, status')
    .eq('tournament_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true });
```
to:
```ts
  const { data: matches } = await supabase
    .from('matches')
    .select('round, stage, team_a_id, team_b_id, score_a, score_b, status, court')
    .eq('tournament_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true });
```

- [ ] **Step 3: Compute the ladder-format flag**

Immediately after the existing:

```ts
  const isLeaguePlayoffs = tournament.format === 'league_playoffs';
```

add:

```ts
  const isLadder = isLadderFormat(tournament.format);
```

- [ ] **Step 4: Render the badge**

Change:

```tsx
                {stageMatches.map((m, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>
                      {stage === 'league' && (
                        <span className="text-slate-400 mr-2">R{m.round}</span>
                      )}
                      <span className="font-semibold">{teamById.get(m.team_a_id!)}</span>
                      <span className="text-slate-400 mx-1">vs</span>
                      <span className="font-semibold">
                        {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
                      </span>
                    </span>
                    {m.status === 'complete' && (
                      <span className="font-bold text-navy-mid">
                        {m.score_a}-{m.score_b}
                      </span>
                    )}
                  </li>
                ))}
```
to:
```tsx
                {stageMatches.map((m, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>
                      {stage === 'league' && (
                        <span className="text-slate-400 mr-2">R{m.round}</span>
                      )}
                      {!isLadder && m.court !== null && (
                        <span className="text-slate-400 mr-2">{courtLabel(m.court)}</span>
                      )}
                      <span className="font-semibold">{teamById.get(m.team_a_id!)}</span>
                      <span className="text-slate-400 mx-1">vs</span>
                      <span className="font-semibold">
                        {m.team_b_id ? teamById.get(m.team_b_id) : 'BYE'}
                      </span>
                    </span>
                    {m.status === 'complete' && (
                      <span className="font-bold text-navy-mid">
                        {m.score_a}-{m.score_b}
                      </span>
                    )}
                  </li>
                ))}
```

- [ ] **Step 5: Verify**

Run: `npm run build` (from `apps/organizer-web`) — expect a clean TypeScript build (this page has no test file — see Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add "apps/organizer-web/app/t/[id]/page.tsx"
git commit -m "feat: show court badge on public league page for non-ladder formats"
```

---

## After all tasks

Run the full suite once more from `apps/organizer-web`: `npm test && npm run build`. Then do one live check with the dev server (`organizer-web` launch config, port 3000): generate a round for a non-ladder format and confirm the bracket page shows "Centre Court"/"Court 2"/etc., and confirm a ladder format (`claim_the_throne` or `up_and_down_the_river`) still shows its plain `C{n}` tier badge unchanged.
