# Remove Player from Roster — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Let an organizer remove a player from a tournament's roster at any point
before the tournament completes — e.g. someone drops out and needs to be
swapped for a new sign-up — without needing to separately manage their
team first.

## Context

This is the first of three independent sub-projects requested together
(remove player, player profile stats enhancements, location leaderboard).
It's built first since it's the smallest and most isolated.

## Scope decisions (resolved via brainstorming, 2026-07-11)

- **Scope of removal**: available on the Roster page for every player,
  regardless of whether they've already been paired into a team. It is
  only available while the tournament is upcoming (`completed_at is
  null`) — once a tournament is completed, the roster becomes read-only,
  protecting historical match data from accidental edits.
- **Cascade behavior**: removing a player that's already paired into a
  team also removes that team (and, in turn, any matches that team was
  part of), via the same `ON DELETE CASCADE` foreign keys the existing
  "Remove Team" button on the Teams page already relies on. No new
  cleanup logic is needed — this is existing, already-relied-upon
  database behavior.
- **No confirmation dialog**: a plain "Remove" button, consistent with
  the existing "Remove Team" button's UX (no `window.confirm` or modal
  anywhere else in the app for destructive actions).

## Implementation

- New server action `removePlayer(tournamentId: string, playerId:
  string)` in `apps/organizer-web/app/tournaments/[id]/roster/actions.ts`
  — deletes the `players` row by id. Revalidates the roster path
  afterward, matching the existing action pattern in this file.
- `apps/organizer-web/app/tournaments/[id]/roster/page.tsx` additionally
  fetches `tournament.completed_at`. The Players list changes from a flat
  pill display to a row-per-player list (matching the Teams page's
  existing row style), each with a "Remove" button — shown only when
  `completed_at` is `null`.

## Out of scope for this feature

- Any confirmation/warning dialog before removing a paired player, even
  though it cascades to delete their team and matches (matches existing
  app conventions).
- Any change to the Teams page's own "Remove Team" button or behavior.
- Any change to how players are added (existing "Add Existing Players" /
  "Add New Players" flows are untouched).

## Related (separately confirmed, not part of this feature)

While reviewing this request, the round-robin scheduling requirement
("everyone plays at least N-1 rounds for N teams") was confirmed to
already be correct in `lib/tournament/roundRobin.ts` — no fix needed,
just a unit test to lock in the guarantee. That test will be added
alongside this feature's own tests since it's a trivial, zero-risk
addition to the same test suite.
