# Player History Links & Vertical Roster Lists — Design

Status: Approved, pending spec review before implementation plan.

## Goal

Change the player roster lists shown on Upcoming Matches' and Recently
Completed's detail views from horizontal pill layouts to vertical lists,
and make each player's name a link to their match history — publicly, so
it works for anonymous visitors following a shared tournament link, not
just the signed-in organizer.

## Scope decisions (resolved via brainstorming, 2026-07-11)

- **Public access to player history**: a new public route shows a
  player's history to anyone with their direct link — same trust model
  already used for tournament pages (unguessable-ID-based access, not
  browsable/listable). The existing organizer-only `/people` list page is
  unaffected; nothing becomes browsable that wasn't already.
- **History content**: the public view shows the same content as the
  existing organizer-only Player Profile page — This Month stats,
  Head-to-Head (toughest opponent / best partner), and full Match
  History. No reduced/lightweight version.
- **Completed-tournament roster**: the Results page gains a new
  "Players" card (it doesn't have one today — only team pairings inside
  the standings/match tables, which are unaffected by this feature).
- **Unlinked players**: a player row renders as a plain, non-clickable
  name when that player isn't yet linked to a durable person record
  (`person_id is null`) — no special styling, just no link.

## Data model

- New RLS policy on `public.people`: `people_select_public: for select
  using (true)`. Additive — it coexists with the existing
  `people_select_own` policy (organizer-scoped). Postgres OR's multiple
  SELECT policies together, so:
  - The organizer's own `/people` list and detail pages are unaffected —
    they already scope with `.eq('organizer_id', organizer.id)` at the
    app layer, same as before.
  - A public, unauthenticated query for one specific person's `id` now
    succeeds, the same way `tournaments`/`players`/`teams`/`matches`
    already work: publicly readable at the row level, with privacy
    enforced by which queries the app's pages actually send, not by RLS
    alone.

## New public route: `/p/[personId]`

A near-exact mirror of the existing `apps/organizer-web/app/people/[id]/page.tsx`:

- Same three sections: **This Month** (games won/lost, tournaments won),
  **Head-to-Head** (toughest opponent, best partner), **Match History**
  (full list with date, partner, opponents, score, win/loss styling).
- Same pure-function pipeline: `buildPersonMatchRecords`,
  `computePersonStats`, `computeStandings` — all reused unchanged.
- Differences from the organizer page: uses the plain unauthenticated
  Supabase client (`@/lib/supabase/server`'s `createClient`, the same one
  `/t/[id]` already uses) instead of `requireOrganizer()`; scopes
  tournaments by the fetched person's own `organizer_id` column instead of
  a signed-in organizer's id; uses a simple public header (matching
  `/t/[id]`'s style — gradient background, ball icon) instead of
  `OrganizerShell`.
- If the person isn't found (bad/stale id), shows a plain "Player not
  found" message, matching the organizer page's existing not-found
  handling and `/t/[id]`'s existing not-found pattern.

## Roster list changes

- **`apps/organizer-web/app/t/[id]/page.tsx`** (Upcoming Matches' click
  target): the "Players" card's `<ul className="flex flex-wrap gap-2">`
  pill list becomes a vertical `<ul className="space-y-2">` list of rows.
  Each row is `<Link href={`/p/${p.personId}`}>` when `person_id` is set,
  or a plain `<span>` when it's `null`. Row styling matches the existing
  row-list treatment already used elsewhere in the app (e.g. the Teams
  page's rounded, tinted rows), rather than the pill/chip look.
- **`apps/organizer-web/app/tournaments/[id]/results/page.tsx`**
  (Recently Completed's click target): gains a new "Players" card, using
  the exact same vertical list/linking treatment as `/t/[id]`, placed
  above the standings table. Nothing else on this page changes — the
  team-pairing names inside the standings table and match rows stay as
  plain text, not links.
- Both pages need to additionally select `person_id` from the `players`
  table query (both already select `players`, just not that column yet).

## Out of scope for this feature

- Any change to the organizer's existing `/people` list or `/people/[id]`
  detail pages — they keep working exactly as they do today.
- Making team-pairing names (inside standings/match tables) clickable —
  only the new standalone "Players" list rows link out.
- Any UI to link/unlink a player from a person record — that flow already
  exists elsewhere (roster review step) and isn't touched here.
- Rate limiting, analytics, or any other hardening around the newly
  public `/p/[personId]` route beyond the unguessable-ID trust model
  already used for `/t/[id]`.
