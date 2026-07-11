# Player Profile Location Stats — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Add "last date played" and a per-location match count breakdown to a
player's profile, on both the organizer's `/people/[id]` page and the
public `/p/[id]` page.

## Context

This is the second of three independent sub-projects requested together
(remove player — shipped; player profile stats — this one; location
leaderboard — next). Built second per the agreed order.

## Scope decisions (resolved via brainstorming, 2026-07-11)

- **Location count unit**: number of *matches* played at each venue, not
  number of tournaments — matches the granularity the rest of the stats
  pipeline already uses (wins/losses are also per-match).
- **"Last played" basis**: only completed matches count, same as every
  other stat on this page. No credit for an upcoming tournament's date
  before any scores are entered.
- **Page scope**: both `/people/[id]` (organizer) and `/p/[id]` (public)
  get the same additions, kept in sync — matching how the public page
  was built to mirror the organizer page in the previous feature.

## Data model / pure functions

- `RawMatch` (`lib/stats/types.ts`) gains a `venueName: string` field,
  populated the same way `tournamentDate` already is — both pages already
  query `tournaments` per person; that query gains a `venues(name)` join,
  and a new `venueNameByTournamentId` map (parallel to the existing
  `tournamentDateById` map) feeds the field when building `RawMatch[]`.
- `PersonMatchRecord` (`lib/stats/types.ts`) gains the same `venueName`
  field. `buildPersonMatchRecords` copies it across from the matching
  `RawMatch`, the same way it already copies `tournamentDate`.
- `PersonStats` (`lib/stats/types.ts`) gains two new fields, both computed
  in `computePersonStats` (`lib/stats/personStats.ts`):
  - `lastPlayedDate: string | null` — the `tournamentDate` of the most
    recent match in `matchHistory` (already sorted most-recent-first), or
    `null` if there's no completed-match history yet.
  - `matchesByLocation: Array<{ location: string; count: number }>` — one
    entry per distinct `venueName` appearing in the match history, with
    a count of matches played there, sorted by count descending.

## Display changes (both `/people/[id]` and `/p/[id]`)

- A "Last played: {date}" line (or "No matches played yet" when `null`)
  added directly under the player's name in the page header.
- A new "By Location" card — inserted after the existing "This Month"
  card and before "Head-to-Head" — listing each venue from
  `matchesByLocation` with its match count, one row per venue, styled
  like the existing standings-table rows (venue name left-aligned, count
  right-aligned). If `matchesByLocation` is empty, the card shows "No
  matches played yet" (matching the existing empty-state pattern used by
  Match History).

## Out of scope for this feature

- Any change to how tournaments/venues are queried or displayed anywhere
  else in the app.
- A dedicated location leaderboard (top players per venue) — that's the
  next, separate sub-project.
- Editing or filtering match history by location — this is a read-only
  summary count, not a new filter/search feature.
