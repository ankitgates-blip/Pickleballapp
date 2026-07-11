# Organizer Management from Upcoming Matches — Design

Status: Approved, pending spec review before implementation plan.

## Goal

When the signed-in organizer clicks their own tournament from the
Upcoming Matches dashboard section, take them somewhere they can actually
manage it (add/remove players, change location/timeslot) instead of the
public read-only share page — and add the ability to edit location and
timeslot after creation, which doesn't exist today.

## Context

Roster already has full add/remove player controls (shipped in the
"Remove Player from Roster" feature) gated on the tournament not being
completed. The problem is purely that Upcoming Matches cards link to the
public `/t/[id]` page (no edit controls, by design, since anyone with
that link can view it) instead of to Roster. Editing location/timeslot
after creation is a genuinely new capability — today those are only set
once, at creation time.

## Scope decisions (resolved via brainstorming, 2026-07-11)

- **Dashboard click-through**: Upcoming Matches cards link to
  `/tournaments/{id}/roster` instead of `/t/{id}`. The public link isn't
  removed — it's still reachable via the existing "Copy public link"
  button pattern (already built for the Standings page), now also placed
  on Roster, so sharing capability isn't lost.
- **Where location/timeslot editing lives**: a new "Tournament Details"
  card on the Roster page itself (rather than a separate "Edit
  Tournament" page), since Roster is now the main "manage this
  tournament" landing page.
- **Edit scope**: only Location and Timeslot are editable. Name and Date
  stay fixed after creation, matching the original request.
- **Read-only-when-completed applies here too**: the "Tournament
  Details" edit card only shows while `completed_at is null`, consistent
  with the same rule the Players list already follows on this page.

## Implementation

- **`apps/organizer-web/app/tournaments/page.tsx`**: the Upcoming
  Matches card's `<Link href={`/t/${t.id}`}>` becomes `<Link
  href={`/tournaments/${t.id}/roster`}>`, and its "View who's playing →"
  line becomes "Manage tournament →". Recently Completed cards are
  unchanged (they already link to the organizer's own Results page).
- **`apps/organizer-web/app/tournaments/[id]/roster/page.tsx`**:
  - Fetches the tournament's current `venue_id` and `timeslot` alongside
    the existing `completed_at` fetch.
  - Adds the existing `CopyLinkButton` component (from
    `app/tournaments/[id]/standings/CopyLinkButton.tsx`, unchanged) next
    to the page title.
  - Adds a new "Tournament Details" card (shown only when not completed)
    with a form: a Location `<select>` (populated from `venues`,
    defaulting to the tournament's current venue) and a Timeslot
    `<select>` (from `TIME_SLOTS`, defaulting to the tournament's current
    timeslot), plus a Save button.
- **New server action** `updateTournamentDetails(tournamentId: string,
  formData: FormData)` in `roster/actions.ts` — reads `venueId` and
  `timeslot` from the form and updates the `tournaments` row's
  `venue_id`/`timeslot` columns, then revalidates the roster path (and
  the dashboard, since it displays these fields on the tournament's
  card).

## Out of scope for this feature

- Editing tournament Name or Date.
- Removing the public `/t/[id]` page or the ability to share it — it's
  simply reached via a copy-link button instead of being the dashboard's
  default click target.
- Any change to Recently Completed's click-through or to the Results
  page.
- Any change to Teams/Bracket/Scores/Standings pages beyond what's
  already there.
