# Tournament Location & Timing Enhancements — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Require every tournament to specify a location (venue) and a timeslot at
creation, surface both prominently on the dashboard, and restructure the
dashboard so "Upcoming Matches" and "Recently Completed" are the only two
views of an organizer's tournaments (the separate "Your Tournaments" list
is removed).

## Scope decisions (resolved via brainstorming, 2026-07-11)

- **Timeslot input**: a fixed, predefined dropdown — not a free time picker.
  Three slots: Morning (7–10 AM), Afternoon (12–3 PM), Evening (6–9 PM).
- **Venue naming**: the existing `venues` row "Pickle Turf" is kept as-is
  (no rename to match the PRD's "Pickleturf" spelling). A second venue,
  "Picklers", is added. These two are the only selectable locations.
- **Dashboard windows widen, not disappear**: with "Your Tournaments"
  removed, Upcoming Matches becomes "every tournament with `date >= today`"
  (previously capped at the next 14 days) and Recently Completed becomes
  "every tournament with `date < today`" (previously capped at completed
  tournaments from the last 7 days) — so no tournament ever becomes
  unreachable from the dashboard. Recently Completed is keyed on date, not
  on `completed_at`, specifically so a past tournament whose scores were
  never fully entered still shows up somewhere (its Results page just
  won't show a champion banner, since that's already gated on
  `completed_at`).
- **Upcoming detail view**: clicking a card continues to open the existing
  public share-link page (`/t/[id]`), which gains a "Players" section and
  the Location/Timeslot in its header. No new page.
- **Completed detail view**: clicking a card continues to open the
  existing organizer Results page, which gains Location/Timeslot in its
  header. No new roster section — the existing team-pairing display
  (`Player A / Player B` per team, per match) already names every
  participant, satisfying "full roster ... along with final scores".
- **Backfill**: existing tournaments (created before this feature) get
  `timeslot = 'evening'` by default via the migration. New tournaments must
  pick a timeslot explicitly — the create form has no preselected default,
  matching the "mandatory field" requirement.

## Data model

- Insert one row into `public.venues`: `Picklers`.
- Add `tournaments.timeslot`: `text not null default 'evening' check (timeslot in ('morning', 'afternoon', 'evening'))`.
  Additive column with a safe default, so every pre-existing tournament
  gets `'evening'` without needing a manual backfill step.

## Business logic

- New `lib/tournament/timeslots.ts`, mirroring the existing
  `lib/tournament/formats.ts` pattern:
  ```
  export const TIME_SLOTS = [
    { value: 'morning', label: 'Morning (7–10 AM)' },
    { value: 'afternoon', label: 'Afternoon (12–3 PM)' },
    { value: 'evening', label: 'Evening (6–9 PM)' },
  ] as const;
  export type Timeslot = (typeof TIME_SLOTS)[number]['value'];
  export function timeslotLabel(timeslot: string): string { ... }
  ```
- No other new pure functions are needed — this feature is data plumbing
  and display, not new tournament logic.

## Tournament creation form (`tournaments/new/`)

- `page.tsx` gains two required `<select>` fields, placed after Format:
  - **Location**: options are every row from `venues` (currently "Pickle
    Turf" and "Picklers"), with a disabled placeholder option "Select a
    location" and no default — matches the existing disabled-placeholder
    pattern already used for player-pairing selects on the Teams page.
  - **Timeslot**: options from `TIME_SLOTS`, disabled placeholder "Select
    a timeslot", no default.
- `actions.ts`'s `createTournament` stops hardcoding the "Pickle Turf"
  venue lookup. It reads `venueId` and `timeslot` directly from the
  submitted form and inserts both alongside the existing fields.

## Dashboard restructuring (`tournaments/page.tsx`)

- Remove entirely: the "Your Tournaments" heading, its tournament list,
  and the plain `select('id, name, date, completed_at, venues(name)')`
  query that only fed that list (the Upcoming/Recently Completed sections
  already run their own queries).
- The "+ New Tournament" button moves up to sit above the Upcoming
  Matches section (previously it lived in the now-removed "Your
  Tournaments" header row) — it's the only remaining path to create a
  tournament from the dashboard.
- **Upcoming Matches**: filter changes from `date >= today && date <=
  today+14` to just `date >= today`. Sort remains soonest-first.
- **Recently Completed**: filter changes from `completed_at &&
  completed_at >= today-7` to `date < today` (i.e., every tournament whose
  date has passed, whether or not it's been fully scored). Sort by date,
  most-recent-first.
- Both queries add `timeslot` to their `select(...)` list (venue name is
  already selected via the `venues(name)` join).

## Card display

Both Upcoming and Recently Completed cards add Location and Timeslot next
to the existing venue/player-count/date line:

```
📍 Pickle Turf  🕐 Evening  👥 12 players  📅 2026-07-20
```

(Venue name was already shown on cards before this feature; this adds the
timeslot label next to it, using `timeslotLabel(t.timeslot)`.)

## Detail view changes

- **Public page** (`app/t/[id]/page.tsx`, the Upcoming Matches click
  target): the tournament query adds `timeslot`, and the header (which
  already shows tournament name and date) adds a line with Location and
  Timeslot. A new "Players" card is added — a plain list of every row from
  `players` for that tournament, by name, independent of team-pairing
  state (so it's useful even before a bracket has been generated).
- **Results page** (`app/tournaments/[id]/results/page.tsx`, the Recently
  Completed click target): the tournament query adds `timeslot`, and the
  existing header line (`{date} · {formatLabel} · Completed {date}`) gains
  Location and Timeslot. No other changes — the existing standings and
  match-by-match sections already name every participant via team pairs.

## Out of scope for this feature

- Free-form or custom time entry (only the three fixed slots are
  selectable).
- Adding, renaming, or removing venues through the UI (still two fixed
  rows in the `venues` table, same as today's single hardcoded row).
- Editing a tournament's location or timeslot after creation (no edit
  form exists for tournaments today, and this feature doesn't add one).
- Any change to how teams, brackets, matches, or scoring work — this is
  purely location/timeslot metadata and dashboard restructuring.
