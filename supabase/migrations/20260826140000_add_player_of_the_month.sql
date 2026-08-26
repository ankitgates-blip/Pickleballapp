-- Locked-in Player of the Month winners, one row per (venue, year, month), never
-- recomputed once written. person_id is nullable: null means "this month was checked
-- and nobody at this venue met the 3-match eligibility floor" -- distinct from no row
-- existing at all, which means "not checked yet". Without that distinction, a month
-- with no qualifying players would look identical to an unchecked month and get
-- needlessly recomputed on every page load forever, since past months' data never
-- changes. See docs/superpowers/specs/2026-08-26-player-of-the-month-design.md.
create table public.player_of_the_month (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  year integer not null,
  month integer not null check (month between 1 and 12),
  person_id uuid references public.people(id),
  score numeric,
  match_wins integer,
  league_wins integer,
  win_percentage integer,
  matches_played integer,
  locked_at timestamptz not null default now(),
  unique (venue_id, year, month),
  check (
    person_id is null
    or (score is not null and match_wins is not null and league_wins is not null
        and win_percentage is not null and matches_played is not null)
  )
);

alter table public.player_of_the_month enable row level security;

-- Organizer-only surface (reached only through the authenticated app's bottom nav,
-- never a public share page) -- every row is visible to any authenticated organizer,
-- matching how this single-organizer app's other cross-venue pages (Location Stats)
-- already work with no per-organizer row scoping.
create policy "player_of_the_month_select_authenticated" on public.player_of_the_month
  for select using (true);

-- Supabase's default privileges grant every new table INSERT/UPDATE/DELETE/SELECT to
-- anon/authenticated at project bootstrap (see 20260824190000_tighten_public_signup_policies.sql
-- and 20260825150000_add_league_rsvps.sql for this repo's established precedent for
-- revoking that class of default grant). Revoke everything, then re-grant only SELECT
-- to authenticated -- nothing to anon at all, since there is no public-facing use case
-- here. All writes go through lock_player_of_the_month() below, the sole write path.
revoke all on public.player_of_the_month from anon, authenticated;
grant select on public.player_of_the_month to authenticated;

-- Thin, idempotent insert -- takes an already-computed result (computed in TypeScript,
-- where the real scoring logic including champion detection lives -- see
-- lib/stats/playerOfTheMonth.ts) and locks it in exactly once per (venue_id, year,
-- month), whether or not a winner was found. The unique constraint plus `on conflict
-- do nothing` is what actually prevents a double-lock under concurrent callers (e.g.
-- two organizers loading the page in the same instant right after a month rolls over)
-- -- no separate "already locked?" check is needed first, because the constraint
-- itself is the race-free guarantee.
create or replace function public.lock_player_of_the_month(
  p_venue_id uuid,
  p_year integer,
  p_month integer,
  p_person_id uuid,
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
