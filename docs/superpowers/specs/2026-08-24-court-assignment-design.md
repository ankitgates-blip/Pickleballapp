# Court Assignment for Generated Matches — Design

**Date:** 2026-08-24
**Status:** Approved for planning

## Problem

When a round's matches are generated, no physical court is assigned. The `matches` table already has a nullable `court` integer column, but it is only ever populated by the two ladder formats (`claim_the_throne`, `up_and_down_the_river`), where it means "ranking tier" (teams move up/down between courts based on results) — a different semantic from "which physical court is this match played on."

This feature adds the physical-court semantic for every other format: `round_robin`, `popcorn`, `gauntlet`, `custom`, `double_header`, `league_playoffs`. Pickleturf (the venue almost all tournaments use) has exactly 4 courts.

## Scope decisions (resolved during brainstorming)

- **Venue scope:** Court count/labeling is a single global constant (4 courts), not venue-specific, even though a second venue ("Picklers") exists in the `venues` table. Revisit if Picklers is confirmed to have a different layout.
- **Overflow handling:** When a round generates more matches than there are courts (e.g. Custom format: 10 teams → 5 simultaneous matches vs. 4 courts), court numbers cycle back to Court 1 (match 5 gets Court 1 again, implying sequential/wave play on the same court — matches existing organizer practice).
- **Custom format's existing sit-out logic** (`customAuto.ts`) is unrelated and untouched: it picks one team to sit out per round purely for round-robin pairing fairness (odd team count → even active count), with no awareness of court capacity. It already produces more matches than courts in larger rosters; this feature is what makes court numbers meaningful in that case.
- **Ladder formats** (`claim_the_throne`, `up_and_down_the_river`) are explicitly out of scope — their `court` column already means ranking tier, and their existing displays are untouched.

## Architecture

New file `lib/tournament/courts.ts`, following the codebase's existing pattern of pure, unit-tested functions in `lib/tournament/*.ts` (same shape as `customAuto.ts`, `roundRobin.ts`):

```ts
export const NUM_COURTS = 4;

// 0-based index -> 1-based court number, cycling every numCourts.
export function courtForIndex(index: number, numCourts: number = NUM_COURTS): number {
  return (index % numCourts) + 1;
}

export function courtLabel(court: number): string {
  return court === 1 ? 'Centre Court' : `Court ${court}`;
}

// Attaches `court` to each row in array order via courtForIndex.
export function assignCourts<T>(rows: T[]): (T & { court: number })[] {
  return rows.map((row, i) => ({ ...row, court: courtForIndex(i) }));
}
```

A database trigger/default was considered and rejected: this codebase does all scheduling logic in tested TypeScript (see `customAuto.ts`, `claimTheThrone.ts`), and a DB-layer assignment would be invisible to unit tests and harder to reason about for the exact cycling behavior specified above.

## Insertion sites

All in `apps/organizer-web/app/tournaments/[id]/bracket/actions.ts` unless noted. Each batch insert's row-mapping is wrapped in `assignCourts(...)`:

1. `generateBracket` (round_robin, double_header) — ~line 60
2. `generateLeaguePlayoffsBracket` — ~line 118
3. `regenerateLeaguePlayoffsBracket` — ~line 223
4. `generatePopcornBracket` — ~line 320
5. `advanceGauntletRound` — ~line 438
6. `generateSemifinalMatches` — ~line 753
7. `skipToFinalMatch` — ~line 823 (single-row insert; gets Court 1 / "Centre Court")
8. `generateFinalMatch` — ~line 878 (single-row insert; gets Court 1 / "Centre Court")
9. `autoGenerateCustomRound` — ~line 1087

`addCustomMatch` (~line 1011) is the one non-batch, single manual insert: before inserting, query the count of matches already recorded in that round for that tournament, then call `courtForIndex(existingCount)` directly (not `assignCourts`, since there's no array to map).

**Explicitly not touched:** `advanceClaimTheThroneRound` (~line 557) and `advanceUpAndDownRiverRound` (~line 682) — their `court` field already carries ladder-tier meaning and their insert logic is unchanged.

## Display

`formats.ts` gains a shared `isLadderFormat(format: string): boolean` helper (`format === 'claim_the_throne' || format === 'up_and_down_the_river'`). This is currently duplicated inline in `champion.ts`, `results/page.tsx`, and `standings/page.tsx`; those three call sites are updated to import the shared helper instead of re-declaring it — a small DRY cleanup in scope with this change, not a separate refactor.

- **`bracket/page.tsx`** (organizer view): the existing unconditional `{m.court !== null && <span>C{m.court}</span>}` badge becomes conditional on `isLadderFormat(tournament.format)` — ladder formats keep the bare `C{m.court}` tier badge exactly as today; every other format renders `courtLabel(m.court)` instead.
- **`t/[id]/page.tsx`** (public view): currently displays no court information at all. Add a `courtLabel(m.court)` badge next to each match in the per-stage schedule list, gated to `!isLadderFormat(tournament.format)` so ladder formats' public display is unaffected.

## Testing

- `lib/tournament/courts.test.ts` (new): unit tests for
  - `courtForIndex` — indices 0-3 map to courts 1-4, index 4 wraps to court 1, index 7 wraps to court 4
  - `courtLabel` — `1 → "Centre Court"`, `2 → "Court 2"`, `3 → "Court 3"`, `4 → "Court 4"`
  - `assignCourts` — preserves each row's original fields, assigns `court` in array order matching `courtForIndex`
- Existing per-format generator tests (`roundRobin.test.ts`, `popcorn.test.ts`, `gauntlet.test.ts`, `customAuto.test.ts`, `playoffs.test.ts`) each get one added assertion confirming inserted/returned matches carry `court` values 1-4 in cycling order, where those tests exercise the insertion path.
- No test changes needed for `claimTheThrone.test.ts` / `upAndDownTheRiver.test.ts` — untouched behavior.

## Migration

None required — `court` is already a nullable `integer` column on `matches`.

## Out of scope

- Venue-specific court counts (revisit if Picklers is confirmed to differ).
- Any UI for organizers to manually override/reassign a match's court after generation.
- Changing ladder-format court semantics or display.
