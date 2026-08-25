# Custom League Ad-Hoc Team Isolation — Design

**Date:** 2026-08-25
**Status:** Approved for planning
**Supersedes/amends:** `docs/superpowers/specs/2026-08-25-custom-league-odd-player-pairing-design.md` (commits `0238452`..`5bf1c93`, not yet pushed). The fairness algorithm from that feature (`lib/tournament/customPlayerHistory.ts`, `lib/tournament/customDynamic.ts`) is reused unchanged — this spec fixes how the rest of the system integrates with it.

## Problem

The final whole-branch review of the odd-player pairing feature found a Critical bug: ad-hoc teams created by dynamic-mode rounds are inserted into the same `teams` table as organizer-fixed teams, and `computeCustomAutoRound` (the fixed-team generator) has zero awareness of which players are on which team — only team IDs. Concretely, with 5 players and fixed teams T1=(P1,P2)/T2=(P3,P4): an odd round creates ad-hoc T3=(P2,P3)/T4=(P4,P5); a 6th player joining flips the count even; the next fixed-mode round can then legitimately schedule **T1 vs T3 = (P1,P2) vs (P2,P3)** — P2 playing against themselves. This is not a rare edge case: it fires on the very first even round after any odd round, which is the tournament-lifecycle scenario the feature is built around.

Three related gaps surfaced in the same review:
- The even-mode "Add Match" team dropdown has the same blind spot — it only rejects `teamAId === teamBId`, not shared player membership.
- The Teams page's "Unpaired players"/manual-pairing UI degrades to nonsense once ad-hoc teams exist for most players (`unpairedPlayers` hits 0, "Pair"/"Shuffle" disappear, ad-hoc pairs show in the manageable team list with cascade-deleting Remove buttons).
- Standings and the tournament champion stay team-based for Custom League (`custom` is not in `INDIVIDUAL_FORMATS`), so after any dynamic round, standings fragment into meaningless one-off ad-hoc pairs.

## Scope decisions (resolved during brainstorming)

- **Trigger condition changes** from "total player count is odd" to **"at least one player has no fixed team"** — this is the actual problem (someone left out), not a numeric proxy for it, and it also covers an organizer who simply hasn't finished pairing everyone yet. "Fixed team" means a team with `is_ad_hoc = false`; an ad-hoc team from a past dynamic round does not count as being paired.
- **Schema addition accepted:** `teams.is_ad_hoc boolean not null default false`. This is the one durable fix for the Critical bug — without it, there is no way to keep the fixed-team generator's candidate pool from being polluted by ad-hoc teams.
- **Ad-hoc teams are hidden entirely from the Teams page** — not shown in the main team list, not counted toward "paired." Organizers see who played whom via player names on the Bracket/Results pages, same as Popcorn/Gauntlet today.
- **Custom League standings and champion switch to player-level (individual) standings**, reusing the existing `computeIndividualStandings` function. This must NOT be done by adding `custom` to `INDIVIDUAL_FORMATS`, since that flag also drives the Teams page's auto-paired banner (which must stay off for Custom — fixed-team manual pairing still exists). A new, narrower check is introduced instead.
- **The core fairness algorithm (`customPlayerHistory.ts`, `customDynamic.ts`) is unchanged** — this spec only changes what data feeds it and how the rest of the app reacts to its output.

## Architecture

### Schema

New migration `supabase/migrations/20260825120000_add_teams_is_ad_hoc.sql`:

```sql
alter table public.teams add column is_ad_hoc boolean not null default false;
```

No RLS policy changes needed — existing `teams` policies are unaffected by an additional column with a default.

### Pool isolation (the Critical-bug fix)

Two different consumers of `teams` now use two different filters, and this distinction is the whole fix:

- **Fixed-team generator (`computeCustomAutoRound`) and the even-mode "Add Match" path** — both query/validate against `teams` filtered to `is_ad_hoc = false` only. Ad-hoc teams are structurally invisible to them, so a fixed-team round can never schedule a team that shares a player with anything.
- **The fairness ledger (`derivePlayerHistory`)** — still needs the *unfiltered* team list (fixed + ad-hoc), because it must resolve any past match's `team_a_id`/`team_b_id` back to the four players who actually played, regardless of which generator created that team.
- **Ad-hoc teams get `is_ad_hoc: true`** set explicitly on insert, in both `autoGenerateCustomRound` and `addCustomMatch`.

### Trigger condition

`autoGenerateCustomRound`, `addCustomMatch`, the bracket page's Add Match form, and the Teams page note all compute the same thing: query `teams` filtered to `is_ad_hoc = false`, collect the paired player ids from those, and check whether any registered player is missing from that set. This is exactly the Teams page's existing `unpairedPlayers` derivation, just filtered to fixed teams and now also driving mode selection elsewhere.

### Standings and champion

A new function in `lib/tournament/formats.ts`:

```ts
export function usesIndividualStandings(format: string): boolean {
  return isIndividualFormat(format) || format === 'custom';
}
```

`results/page.tsx`, `standings/page.tsx`, and `champion.ts` each currently gate `computeIndividualStandings` on `isIndividualFormat(format) && !isLadderFormat`. All three swap that to `usesIndividualStandings(format) && !isLadderFormat`. The `teamsForIndividual` array these call sites already build from `teams` must use the *unfiltered* team list (fixed + ad-hoc), matching `derivePlayerHistory`'s requirement, so `computeIndividualStandings` can resolve every match regardless of which generator produced it.

`isIndividualFormat` and everything gated on it directly (Teams page's `isAutoPaired`, and any other existing call site) are **not modified** — Custom League keeps its manual/fixed-team pairing UI.

### Teams page

- `unpairedPlayers` is computed from `is_ad_hoc = false` teams only (as above).
- The main "Teams (N)" list filters to `is_ad_hoc = false` — ad-hoc teams never render there, so there's nothing to accidentally cascade-delete via the existing "Remove" button.
- The odd-count note (added in the prior feature) is reworded from "odd number of players" to "unpaired player" language and re-gated on the new `unpairedPlayers`-based check instead of parity.

## Testing

- New migration: no automated test (schema-only change, matches the codebase's existing migration convention — none of the prior migrations have test coverage).
- `lib/tournament/formats.test.ts` (existing, from the court-assignment feature): add a `usesIndividualStandings` describe block — true for every `isIndividualFormat` value plus `'custom'`, false for `round_robin`/`double_header`/`league_playoffs`/the two ladder formats.
- `bracket/actions.ts`, `bracket/page.tsx`, `teams/page.tsx`, `results/page.tsx`, `standings/page.tsx` have zero test coverage anywhere in this codebase, by established convention (confirmed in the court-assignment feature's plan and re-confirmed in the odd-player-pairing feature's plan) — changes to these are verified via `npm run build` + `npm test` (regression) only. `champion.ts` has existing test coverage (`champion.test.ts`) that must still pass, and gets a new case added: a Custom League tournament with mixed fixed/ad-hoc teams resolves a per-player, not per-team, champion.

## Migration path for the 6 already-landed (unpushed) commits

Nothing is reverted. `customPlayerHistory.ts` and `customDynamic.ts` (Tasks 1-2) are reused as-is. `autoGenerateCustomRound`, `addCustomMatch`, the bracket page form, and the Teams page note (Tasks 3-6) are amended in place by new tasks in the implementation plan — not rewritten from scratch — since only their trigger condition and team-pool filtering need to change, not their overall shape.

## Out of scope

- Any UI to let an organizer manually convert an ad-hoc team into a permanent fixed one.
- Cleaning up/deleting orphaned ad-hoc teams that never got reused.
- Retroactively fixing standings for any tournament that may have already been run against the buggy pre-fix code (none have, in production — the buggy commits were never pushed).
