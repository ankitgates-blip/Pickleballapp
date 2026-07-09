# Player Stats & Match History Dashboard — Design

Status: Approved, pending spec review before implementation plan.
Inspiration: Pickleheads' player stats/history view (weekly play frequency, win/loss,
podium finishes, full game history). Origin: user's original app pitch also asked for
toughest-opponent and best-partner analysis, both folded in here.
Related PLAN.md items: Phase 3.3 (all-time match history), 3.4 (consolidated stats
dashboard), 3.5 (toughest opponent), 3.6 (best partner) — built together in this feature
since they share the same underlying data, ahead of 3.1/3.2 (DUPR lookup, rich profile)
which this feature does not depend on.

## Goal

Give the organizer a cross-tournament view of any player's history and performance:
weekly/monthly/yearly win-loss and tournaments-won breakdown, full match history, their
toughest opponent (worst head-to-head), and their best partner (highest win rate
together) — all computed from match data already collected starting in Increment 1.1.

## Foundational problem this solves

The current data model has no durable player identity across tournaments — every
tournament's `players` (roster) rows are independent, so "Alice" in one tournament and
"Alice" in another are unrelated rows with no link between them. A cross-tournament stats
dashboard is impossible without solving this first.

## Scope decisions (resolved via brainstorming, 2026-07-09)

- **Durable `people` table, organizer picks or creates on roster entry** — not
  auto-matching by exact name with no confirmation, and not requiring real player
  accounts/self-service claiming (that's Phase 1.5's player app, out of scope here).
  This matches PLAN.md §6's already-anticipated "roster-claiming" behavior.
- **Roster paste flow gets a review step** — pasted names are matched (case-insensitive,
  trimmed) against the organizer's existing `people`; a confirmation screen shows
  "Matched to existing: ..." vs. "New people: ..." before anything is written. No inline
  correction UI on the review screen — fix ambiguous names by re-pasting a disambiguated
  name, or via direct data correction later. Not a full merge/dedup tool.
- **All three analyses included together**: match history, weekly/monthly/yearly
  stats, toughest opponent, best partner — all derive from the same match-history query,
  so bundling them is cheap once the People foundation exists.
- **Live computation, not a background rollup job** — PLAN.md §4.7 originally called for
  precomputed summary tables via a scheduled job. At this app's actual scale (one venue,
  casual recurring play, current match volume in the dozens), that's premature
  infrastructure. Stats are computed on page load from raw match data by a pure
  TypeScript function, the same pattern already used for round-robin generation,
  standings, and shuffle in Increments 1.1/1.2. Revisit only if this becomes measurably
  slow.
- **Organizer-facing only** — no player login/self-service view exists yet (Phase 1.5),
  so `/people` and `/people/[id]` are organizer-only pages, RLS-scoped like `tournaments`.

## Data model

```sql
people (id, organizer_id, name, created_at)
```

- RLS: organizer can only select/insert/update their own `people` rows (same
  `organizer_id`-ownership pattern as `tournaments`). Not publicly readable — unlike
  tournament data, this is an organizer's private roster-history view, and no public
  "player profile" page exists yet.

`players` (from Increment 1.1) gets one new nullable column:

```sql
alter table public.players add column person_id uuid references public.people(id);
```

Additive per PLAN.md §4's migration rule — existing rows keep working with
`person_id = null` until backfilled.

**Backfill**: the same migration creates one `people` row per existing distinct `players`
row (1:1 — no fuzzy name-merging) and sets `person_id` accordingly, so the organizer's
real existing roster data (14 players across the "Test Round Robin" tournament, including
two separate "Mike" rows) shows up in stats immediately rather than being silently
orphaned by the schema change.

## Roster entry flow changes (modifies `app/tournaments/[id]/roster/`)

Two-step form, replacing Increment 1.1's single-step "paste → insert":

1. **Step 1 (unchanged from the player's perspective)**: paste names, click "Add
   Players." A server action matches each pasted name against the organizer's existing
   `people` (case-insensitive, trimmed) and re-renders the page in a "reviewing" state:
   two lists — "Matched to existing person" and "New people" — with the original pasted
   names carried through as hidden form fields, plus a "Confirm" button.
2. **Step 2**: "Confirm" posts to a second server action that creates any new `people`
   rows needed, then creates the `players` rows for this tournament, each linked to the
   correct `person_id` — functionally identical to Increment 1.1's insert, just with
   `person_id` now populated.

## New pages

- **`/people`** (new top-level route, linked from `OrganizerShell`'s header nav):
  list of all `people` for this organizer, each row showing tournaments played and
  all-time win-loss, linking to that person's detail page.
- **`/people/[id]`**: full dashboard —
  - Weekly / monthly / yearly breakdown: tournaments won, games won/lost, grouped by
    the tournament's `date` column.
  - All-time match history: every match this person's teams played, across every
    tournament, with opponent(s), partner, score, and win/loss — newest first.
  - Toughest opponent: the other person against whom this player has their worst
    head-to-head win rate (minimum 1 match together; ties broken by most matches played
    against that opponent).
  - Best partner: the partner this player has the highest win rate with (same
    tie-break rule).

## Stats logic (`lib/stats/personStats.ts`, plain TypeScript)

- `computePersonStats(matches: PersonMatchRecord[]): PersonStats` where
  `PersonMatchRecord` carries everything the page's Supabase query already joins:
  tournament date, opponent person id(s), partner person id, scores, win/loss. Pure
  function, no Supabase dependency, unit-tested with fixed data — same pattern as
  `roundRobin.ts` / `standings.ts` / `shuffle.ts`.
- Returns weekly/monthly/yearly aggregates, the full match list (pass-through, already
  sorted by the query), toughest-opponent (person id + record), and best-partner
  (person id + win rate).

## Testing

- Unit (Vitest): `computePersonStats` — matches spanning multiple weeks/months/years
  roll up correctly; a clear toughest-opponent case; a clear best-partner case; tie-break
  by match count when two opponents/partners have the same win rate.
- Manual/browser verification: after the migration backfills the real "Test Round Robin"
  roster, open `/people`, pick a real player (e.g. Alice), confirm their match history,
  toughest opponent, and best partner match what's actually in the seeded match data.

## Out of scope for this feature (explicitly deferred)

- Real player accounts / self-service login (Phase 1.5's player app).
- DUPR rating lookup (Phase 3.1) and rich profile fields — photo, nickname, jersey
  number, playing style tags (Phase 3.2). This feature only needs a name and an id.
- Merging/deduplicating `people` after the fact (e.g. if the organizer later realizes two
  `people` rows are actually the same person) — not requested, no UI for it here.
- League/ladder formats (the other Pickleheads-inspired feature the user flagged) —
  explicitly sequenced after this one.
