# Player of the Month — Design

**Date:** 2026-08-26
**Status:** Approved for planning

## Problem

The organizer wants a "Player of the Month" feature: a new bottom-nav icon leading to a page that, for the current in-progress calendar month, shows a live "Race to Player of the Month" (top 5, ranked by a weighted score of league wins, match wins, and win percentage), and once a month ends, reveals that month's winner in a celebratory, shareable "postcard" — the winner's photo and stats, styled like the existing Player Stats Card but with a "Player of the Month" / congratulations treatment around it.

## Scope decisions (resolved during brainstorming)

- **Scoring formula:** `score = 0.5 × normalizedLeagueWins + 0.3 × normalizedMatchWins + 0.2 × (winPercentage ÷ 100)`, where `normalizedLeagueWins`/`normalizedMatchWins` are each divided by the highest raw count among eligible players that month (same normalization approach as the existing `computeLocationLeaderboard`). Only players with **3+ matches played** that month, at that venue, are eligible.
- **"League wins"** = tournament/league championships, using the same champion-detection logic already used elsewhere (`computeTournamentChampionPersonIds`), scoped to tournaments whose `date` falls in the target month.
- **Scope:** per venue — Pickleturf and Picklers each get their own independent race and their own winner each month, shown side by side on one page (mirroring how `/locations` already shows each venue's leaderboard side by side).
- **Persistence:** once a month ends, that month's winner is **locked in permanently** in a new database table — never recomputed even if underlying match data changes later. This is a deliberate deviation from this app's usual "everything derived live" convention, because a Player of the Month title is meant to be a fixed historical fact once awarded.
- **Nav placement:** added as a 4th bottom-nav icon (Player Profile, Player of the Month, Create League, Leaderboard) — nothing removed.
- **Postcard design:** extends the existing `PlayerStatsCard` component (same 640×360 SVG-to-PNG trading-card mechanism) rather than a new bespoke component, with a gold "Player of the Month" banner/confetti treatment added around it.
- **Postcard stats scope:** all numbers on the postcard (wins, losses, win streak, rating, star count, etc.) reflect **that specific winning month's** performance, not the player's all-time stats — computed by filtering the same match-history data the regular stats card already uses down to that month, then feeding it through the same existing pure stat functions (`longestWinStreak`, `winsInLastN`, `starRating`, etc.), which are already generic over any match list.
- **Shareable:** yes — the postcard reuses the existing `shareOrDownloadFile` PNG-export mechanism `PlayerStatsCard` already has.

## Architecture

### Data model

One new table, one locked row per (venue, year, month):

```sql
create table public.player_of_the_month (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  year integer not null,
  month integer not null check (month between 1 and 12),
  person_id uuid references public.people(id), -- null means "checked, nobody was eligible"
  score numeric,
  match_wins integer,
  league_wins integer,
  win_percentage integer,
  matches_played integer,
  locked_at timestamptz not null default now(),
  unique (venue_id, year, month),
  check (person_id is null or (score is not null and match_wins is not null and league_wins is not null and win_percentage is not null and matches_played is not null))
);
```

`score`/`match_wins`/`league_wins`/`win_percentage`/`matches_played` are stored alongside the winner so the postcard never needs to recompute (or risk recomputing differently from) the numbers that won them the title — the row is a complete, frozen record of the decision, not just a pointer to a person. `person_id` is nullable specifically to distinguish "this month was checked and nobody at this venue met the 3-match floor" from "this month hasn't been checked yet" — without that distinction, a month with no qualifying players would look identical to an unchecked month and get needlessly recomputed on every single page load forever, since past months' data never changes.

RLS: this is an organizer-only surface (reached only through the authenticated organizer app's bottom nav, never a public share page) — enabled, with a `select` policy for `authenticated`, and no direct table-level `insert`/`update`/`delete` grant to `authenticated` or `anon`. All writes go through one `SECURITY DEFINER` function (below), matching the established pattern from `set_league_rsvp` — the sole difference being this function's `execute` grant goes to `authenticated` only (there is no anonymous-facing use case here, unlike the RSVP flow).

### Where the scoring computation happens: TypeScript, not SQL

**"League wins" cannot be computed correctly in a raw SQL query.** Championship detection is already nontrivial, format-branching logic that lives in `lib/tournament/champion.ts`'s `computeTournamentChampionPersonIds` — a final-match winner for bracket formats, but individual/ladder standings for format families where there's no single final match, and only once a tournament is actually completed. This exact function is already reused (not reimplemented) by both the tournaments list page and the Location Stats leaderboard specifically *because* an earlier ad-hoc reimplementation attempt got it wrong for non-bracket formats (see the existing comment in `app/locations/page.tsx`: reimplementing this "previously credited 'League Won' to whoever's ephemeral per-round pairing happened to have the best record... which isn't how those formats crown a winner"). Reimplementing that branching logic a third time, in SQL, would risk the exact same class of bug and create a second place for it to drift out of sync. So the scoring computation must happen in TypeScript, reusing `computeTournamentChampionPersonIds` directly, not in the database.

This means the lock function's job shrinks to exactly what only the database can guarantee — atomic, race-free "insert if not already locked" — and nothing more:

```sql
create or replace function public.lock_player_of_the_month(
  p_venue_id uuid,
  p_year integer,
  p_month integer,
  p_person_id uuid, -- null means "checked, nobody was eligible" -- see table comment
  p_score numeric,
  p_match_wins integer,
  p_league_wins integer,
  p_win_percentage integer,
  p_matches_played integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
-- Thin, idempotent insert -- takes an already-computed result (computed in TypeScript,
-- see below, where the real scoring logic including champion detection lives) and
-- locks it in exactly once per (venue_id, year, month), whether or not a winner was
-- found. The unique constraint plus `on conflict do nothing` is what actually prevents
-- a double-lock under concurrent callers (e.g. two organizers loading the page in the
-- same instant right after a month rolls over) -- the "already locked?" check doesn't
-- need to happen here first, because the constraint itself is the race-free guarantee.
begin
  insert into public.player_of_the_month
    (venue_id, year, month, person_id, score, match_wins, league_wins, win_percentage, matches_played)
  values
    (p_venue_id, p_year, p_month, p_person_id, p_score, p_match_wins, p_league_wins, p_win_percentage, p_matches_played)
  on conflict (venue_id, year, month) do nothing;
end;
$$;

revoke execute on function public.lock_player_of_the_month(uuid, integer, integer, uuid, numeric, integer, integer, integer, integer) from public;
grant execute on function public.lock_player_of_the_month(uuid, integer, integer, uuid, numeric, integer, integer, integer, integer) to authenticated;
```

### The scoring function

A new pure function, `lib/stats/playerOfTheMonth.ts`, parallel in spirit to `computeLocationLeaderboard`:

```ts
export type MonthlyCandidate = {
  personId: string;
  matchWins: number;
  matchLosses: number;
  leagueWins: number; // count of computeTournamentChampionPersonIds results naming this person, for tournaments in this venue+month
};

export type MonthlyWinner = {
  personId: string;
  score: number;
  matchWins: number;
  leagueWins: number;
  winPercentage: number;
  matchesPlayed: number;
};

export function computePlayerOfTheMonth(candidates: MonthlyCandidate[]): MonthlyWinner | null;
```

It filters to `matchWins + matchLosses >= 3`, applies the weighted formula (normalizing `leagueWins`/`matchWins` against the max among eligible candidates, exactly like `computeLocationLeaderboard` already does for its two factors), and returns the single highest-scoring candidate — or `null` if nobody is eligible that month at that venue.

### Orchestration: locking every missing month

A new Server Action (e.g. `lockMissingPlayerOfTheMonthWinners()` in a new `app/player-of-the-month/actions.ts`) does the actual work, called from the page's server component before it queries `player_of_the_month` for display:

1. For each venue, determine the range of months needing locking (see "Page structure" below).
2. For each month in that range: query `players`/`matches`/`teams`/`tournaments` for that venue restricted to that month's date range (same join shape the Location Stats page already builds), run `computeTournamentChampionPersonIds` once per tournament in range to get that month's league-win credits, tally each person's `matchWins`/`matchLosses`/`leagueWins` into `MonthlyCandidate[]`, and call `computePlayerOfTheMonth`.
3. Call the `lock_player_of_the_month` RPC for that month either way — with the winner's values if one was found, or with `p_person_id: null` and every stat column `null` if `computePlayerOfTheMonth` returned `null` (nobody eligible). Either way, a row now exists for that `(venue_id, year, month)`, so step 1's range calculation on the next page load correctly starts from the month *after* this one, rather than re-checking it forever.

### Live race (current month)

The current, still-in-progress month is **never** persisted — it's recomputed on every page load, exactly like every other live stat in this app (weekly/monthly/yearly trend rows, the existing Location Stats leaderboard). A new pure function, parallel to `computeLocationLeaderboard`, computes the same weighted score for the current month's eligible players per venue and returns the top 5, sorted descending by score.

### Page structure

New page (e.g. `/player-of-the-month`), reached via the new nav icon. For each venue, in order:

1. **🏆 Player of the Month** — if last month's row has a non-null `person_id`, render the winner's postcard (see below). If the row's `person_id` is null (nobody at that venue met the 3-match eligibility floor last month) or no row exists at all yet, render a plain "No Player of the Month last month" message instead of a broken card.
2. **🏁 Race to Player of the Month** — the current month's live top-5, as a simple ranked list (name, score-driving stats), not a full postcard — this is a leaderboard, not a celebration.

On page load, the server component locks **every completed month that isn't checked yet**, not just last month — it queries each venue's most recent *checked* `(year, month)` (any row, whether or not it has a winner — see the schema note above on why `person_id` is nullable; if no row exists yet at all, it starts from the earliest month with any completed tournament at that venue), then calls `lock_player_of_the_month` once per month from there through last month (inclusive), before querying `player_of_the_month` for display. This is what makes the mechanism safe against gaps: if the page goes unvisited for three months, the next visit checks all three, not just the most recent — a plain "last month only" version would silently and permanently skip checking any month nobody happened to view the page during.

### The postcard component

A new component, `PlayerOfTheMonthCard`, wrapping the existing `PlayerStatsCard`: same SVG card at its core (photo, name, rating, stats, signature shots — all computed from that month's match-filtered data, using the same existing pure functions the regular card already calls), with an added gold ribbon/banner reading "🏆 Player of the Month — {Month Year}" across the top and a light confetti/sparkle accent treatment around the border, in the app's existing gold brand color. It reuses `PlayerStatsCard`'s existing `shareOrDownloadFile` PNG-export mechanism for the share button, so posting a winner's card to WhatsApp works exactly like the existing player-stats sharing already does today.

### Nav wiring

`OrganizerShell.tsx`'s bottom nav gets a 4th `<Link>`, matching the existing `PersonIcon`/`LeaderboardIcon` pattern (a new `TrophyIcon`, same 22×22 stroke-based SVG style), positioned between "Player Profile" and the center "Create League" FAB. All four nav items narrow slightly (`flex-1` already handles even distribution automatically — no fixed-width changes needed).

## Testing

- `computePlayerOfTheMonth` (the weighted normalization, eligibility floor, and null-when-nobody-eligible behavior) is a new pure function in `lib/stats/*.ts` and gets full Vitest coverage, matching this codebase's established convention for that directory — parallel in style to `locationLeaderboard.test.ts`.
- The month-filtered stat derivations (feeding a month-scoped match subset into `longestWinStreak`, `winsInLastN`, `starRating`, etc.) don't need new tests of their own — those functions are already tested generically over arbitrary match lists; the "filter to one month" step is a thin, obviously-correct slice operation.
- The `lock_player_of_the_month` migration is schema-only from a test-file perspective (no test file, matching every other migration in this codebase) — verified manually: call it twice in a row with the same `(venue_id, year, month)` and confirm the second call is a no-op (idempotency), and confirm a `p_person_id: null` call correctly inserts a "checked, no winner" row rather than erroring against the table's `check` constraint.
- The month-range-to-check calculation (the "find the earliest unchecked month, loop through last month" logic) is genuine new logic worth a real test — it should live as its own small pure function (taking "most recent checked month, if any" and "today's date" and returning the list of `(year, month)` pairs to check) rather than being buried inline in the Server Action, specifically so it's independently testable without a database.
- `PlayerOfTheMonthCard`, the new page, the orchestrating Server Action, and `OrganizerShell.tsx`'s nav change remain untested directly, per this codebase's established convention for client components, pages, and `'use server'` files — verified via `npm run build` + `npm test` (regression) + manual check.

## Out of scope

- Any notification when a new Player of the Month is decided (no notification system exists in this app).
- Editing or manually overriding a locked winner (if a genuine correction is ever needed, it would be a direct database fix, not an in-app admin tool — not built here).
- Any change to the existing `computeLocationLeaderboard`/Location Stats page — this is a new, separate ranking, not a replacement for the existing all-time venue leaderboard.
- Backfilling months that predate the feature's own launch, or predate a venue's first-ever tournament — the loop described above only ever starts from the earliest month with real tournament data at that venue, so there's no attempt to invent a winner for a month with no matches.
