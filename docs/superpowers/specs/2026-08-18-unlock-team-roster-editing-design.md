# Unlock Team Roster Editing — Design

Status: Approved, pending spec review before implementation plan.

This is Part 1 of 2 for the organizer's requested editing capabilities
(the other part, match admin controls, is a separate spec). This part
reverts a safety guard added earlier the same session, at the organizer's
explicit, informed request.

## Goal

Let the organizer pair, shuffle, or remove teams for a League + Playoffs
tournament at any time, even after its league schedule has already been
generated — with a non-blocking warning shown when doing so, instead of
the hard block currently in place.

## Current state

`apps/organizer-web/app/tournaments/[id]/teams/actions.ts`'s `pairTeam`,
`shuffleRemaining`, and `removeTeam` each throw (or, for `shuffleRemaining`,
silently no-op) when `hasLeaguePlayoffsMatches(supabase, tournamentId)`
returns true for a `league_playoffs` tournament — added in commit
`74d3fdb` specifically to prevent `advanceLeaguePlayoffsRound` (which
recomputes the full round-robin schedule from the *current* team list on
every call) from silently producing an inconsistent schedule if the roster
changed mid-tournament.

## Design

### Remove the blocking guards

In all three functions, remove the `if (await hasLeaguePlayoffsMatches(...)) { throw / return; }`
check entirely — restoring `pairTeam`, `shuffleRemaining`, and `removeTeam`
to unconditional behavior for `league_playoffs` (matching how they already
behave, unconditionally, for every other format). The pre-existing 8-team
cap check in `pairTeam`/`shuffleRemaining` is untouched — that's a
separate, unrelated constraint.

### Repurpose `hasLeaguePlayoffsMatches` for a page-level warning instead

The helper function itself stays (it's a small, generically useful "does
this tournament already have a league schedule" check), but its call site
moves from the server actions to the Teams page
(`apps/organizer-web/app/tournaments/[id]/teams/page.tsx`), which already
fetches enough to determine this without an extra query (it already knows
the tournament's format and can check for existing league matches the
same way the Bracket page does — `hasLeagueMatches`).

When `format === 'league_playoffs'` and the tournament already has league
matches, the Teams page shows a small, non-blocking banner above the
existing pairing/shuffle/remove controls:

> This tournament already has a generated schedule. Changing teams here
> won't update already-generated rounds or matches.

The banner is purely informational — it never prevents the pairing/
shuffle/remove actions from running, and there's no confirmation dialog
gating them (a confirm dialog would let the organizer back out, which is
exactly the "block" this design explicitly avoids).

### Scope

Only `league_playoffs` is affected — it's the only format whose Teams-page
manual pairing UI was ever gated by this guard. `round_robin` and
`double_header` (which also use manual team pairing) never had this
guard applied and don't gain the warning banner either, since their
bracket generation is one-shot rather than recomputed from a live roster
on every round — a stale roster there just means a newly-added team never
gets matches, not a corrupted schedule. The four individual/ladder formats
(Popcorn, Gauntlet, Claim the Throne, Up and Down the River) bypass the
Teams page's manual pairing UI entirely already (per `isIndividualFormat()`),
so there's nothing to unlock or warn about there.

## Out of scope

- Match-level editing (team reassignment on an existing match, deleting/
  adding match rows) — covered by the separate "Match Admin Controls"
  spec.
- Any change to `advanceLeaguePlayoffsRound` itself, or to how it
  recomputes the schedule.
