-- Locked-in Player of the Month winners, one row per (organizer, venue, year, month),
-- never recomputed once written. person_id is nullable: null means "this month was
-- checked and nobody at this venue met the 3-match eligibility floor" -- distinct from
-- no row existing at all, which means "not checked yet". Without that distinction, a
-- month with no qualifying players would look identical to an unchecked month and get
-- needlessly recomputed on every page load forever, since past months' data never
-- changes. See docs/superpowers/specs/2026-08-26-player-of-the-month-design.md.
--
-- Scoped to organizer_id (unlike this app's other cross-venue pages, e.g. Location
-- Stats, which pool all organizers' data) because these rows are PERMANENT -- any
-- second signed-in user (this app has open Google sign-in with no allowlist, and every
-- new auth user gets an organizers row automatically) must never be able to freeze a
-- wrong result into another organizer's history with no repair path.
create table public.player_of_the_month (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id),
  venue_id uuid not null references public.venues(id),
  year integer not null,
  month integer not null check (month between 1 and 12),
  -- restrict (the default, spelled out here deliberately): deleting a person who has
  -- ever won Player of the Month must not silently erase or corrupt that permanent
  -- record. `deletePerson` (app/people/[id]/actions.ts) is updated in this same fix to
  -- catch this and show a friendly message instead of a raw constraint-violation error.
  person_id uuid references public.people(id) on delete restrict,
  score numeric,
  match_wins integer,
  league_wins integer,
  win_percentage integer,
  matches_played integer,
  locked_at timestamptz not null default now(),
  unique (organizer_id, venue_id, year, month),
  check (
    (person_id is null) = (score is null)
    and (person_id is null) = (match_wins is null)
    and (person_id is null) = (league_wins is null)
    and (person_id is null) = (win_percentage is null)
    and (person_id is null) = (matches_played is null)
  )
);

alter table public.player_of_the_month enable row level security;

-- Organizer-scoped, unlike the earlier draft of this policy which used `using (true)` --
-- see the table comment above for why pooling across organizers is unacceptable here.
create policy "player_of_the_month_select_own" on public.player_of_the_month
  for select using (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );

-- Supabase's default privileges grant every new table INSERT/UPDATE/DELETE/SELECT to
-- anon/authenticated at project bootstrap (see 20260824190000_tighten_public_signup_policies.sql
-- and 20260825150000_add_league_rsvps.sql for this repo's established precedent for
-- revoking that class of default grant). Revoke everything, then re-grant only SELECT
-- to authenticated -- nothing to anon at all, since there is no public-facing use case
-- here. All writes go through lock_player_of_the_month() below, the sole write path.
revoke all on public.player_of_the_month from anon, authenticated;
grant select on public.player_of_the_month to authenticated;

-- Locks in an already-computed result (computed in TypeScript, where the real scoring
-- logic including champion detection lives -- see lib/stats/playerOfTheMonth.ts) for
-- exactly one (organizer, venue, year, month), whether or not a winner was found. The
-- unique constraint plus `on conflict do nothing` is what actually prevents a
-- double-lock under concurrent callers -- no separate "already locked?" check is needed
-- first, because the constraint itself is the race-free guarantee.
--
-- Unlike the first draft of this function, this one does not trust its parameters
-- blindly: the organizer is resolved from auth.uid() (never a caller-supplied value --
-- there is no p_organizer_id parameter, deliberately), the target month must already be
-- in the past, and any given person must actually belong to the calling organizer.
-- Without these, any signed-in user could corrupt another organizer's permanent
-- history, or permanently break the lock mechanism for a venue by forging a row for a
-- future month (the next run's "start from latest checked + 1" logic would derive from
-- that fraudulent row forever).
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
declare
  v_organizer_id uuid;
begin
  select id into v_organizer_id from public.organizers where auth_user_id = auth.uid();
  if v_organizer_id is null then
    raise exception 'Not an organizer';
  end if;

  if make_date(p_year, p_month, 1) >= date_trunc('month', now())::date then
    raise exception 'Cannot lock a month that has not yet completed';
  end if;

  if p_person_id is not null and not exists (
    select 1 from public.people where id = p_person_id and organizer_id = v_organizer_id
  ) then
    raise exception 'Person not found';
  end if;

  insert into public.player_of_the_month
    (organizer_id, venue_id, year, month, person_id, score, match_wins, league_wins, win_percentage, matches_played)
  values
    (v_organizer_id, p_venue_id, p_year, p_month, p_person_id, p_score, p_match_wins, p_league_wins, p_win_percentage, p_matches_played)
  on conflict (organizer_id, venue_id, year, month) do nothing;
end;
$$;

revoke execute on function public.lock_player_of_the_month(uuid, integer, integer, uuid, numeric, integer, integer, integer, integer) from public;
grant execute on function public.lock_player_of_the_month(uuid, integer, integer, uuid, numeric, integer, integer, integer, integer) to authenticated;
