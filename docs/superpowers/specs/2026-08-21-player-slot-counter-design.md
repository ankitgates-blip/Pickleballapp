# Player Slot Counter — Design

Status: Approved.

## Goal

Show a "players added vs. capacity" counter on the Roster page (e.g.
"Players (11/12)"), and once a tournament reaches its capacity, replace
the add-player forms with a clear "All Slots Full" message instead of
silently letting the organizer keep adding players past it.

## Data

New nullable column: `tournaments.max_players integer`. `null` means no
cap — the tournament behaves exactly as it does today (no counter, no
"full" state, add-player forms always available). Only tournaments
where the organizer explicitly sets a number get the counter/full
behavior.

## Setting capacity

- **At creation**: a new optional "Max players" number input on the
  "New Tournament" form (`tournaments/new/page.tsx`), stored via
  `createTournament`. Left blank = `null` (no cap).
- **Editable later**: added to the Roster page's existing "Tournament
  Details" card (`roster/page.tsx`, alongside the existing venue/timeslot
  fields), saved via the existing `updateTournamentDetails` action.
  Clearing the field back to blank removes the cap (sets it back to
  `null`).

## Display

The Roster page's "Players (N)" heading becomes "Players (N/max)"
whenever `max_players` is set for that tournament (e.g. "Players
(11/12)"). When `max_players` is `null`, the heading is unchanged from
today ("Players (N)").

## When full

Once the roster's player count reaches `max_players`, both existing
add-player sections — "Add Existing Players" and "Add New Players" — are
replaced with a message: **"All Slots Full — no more sign up."**
Removing a player (the existing remove action) is unaffected and always
available; removing one naturally drops the count back below the cap,
which brings the add-player forms back automatically.

## Enforcement

Guarded server-side in both actions that actually insert new `players`
rows — `addExistingPeople` and `confirmAddPlayers`
(`roster/actions.ts`) — not only hidden in the UI, consistent with
every other gate already in this app. Before inserting, each action
checks the tournament's `max_players` (if set) against the current
player count plus the number about to be added. If the batch would
exceed the cap, the entire action is rejected with an error stating
how many slots are actually available (e.g. "Only 1 slot left — you
tried to add 3 players.") — no partial admission of the batch.

`startAddPlayers` (which only stages names for the pending-names review
screen, before any insert happens) is not itself guarded — the
authoritative check happens at the real insert point,
`confirmAddPlayers`, which the review screen submits to.

## Out of scope

- No waitlist, no "request to join" flow — a full tournament simply
  stops accepting new players until one is removed or the cap is
  raised.
- No change to team-count logic, bracket generation, or any other
  format-specific rule — `max_players` is purely a roster-size cap.
- No retroactive validation of existing tournaments' player counts
  against a newly-set cap — an organizer can set `max_players` below
  the current roster size (the UI will then already show "full" and
  block further additions, but nothing is removed automatically).
