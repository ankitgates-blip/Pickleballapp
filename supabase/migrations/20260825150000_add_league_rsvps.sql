-- Tracks every RSVP response (in/out/tentative) for League Playoffs' public invite list.
-- A confirmed roster slot is NOT stored here -- it's derived: an 'in' row that also has a
-- matching public.players row (same tournament_id/person_id). The waiting list is the
-- complementary set: 'in' rows with no matching players row, ordered by responded_at. This
-- keeps public.players meaning exactly what it already means everywhere else in the app
-- (teams, standings, bracket generation) -- nothing downstream needs to learn a new state.
-- See docs/superpowers/specs/2026-08-25-league-playoffs-rsvp-design.md.
create table public.league_rsvps (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null check (status in ('in', 'out', 'tentative')),
  responded_at timestamptz not null default now(),
  unique (tournament_id, person_id)
);

create index league_rsvps_tournament_idx on public.league_rsvps(tournament_id);

-- Backstops set_league_rsvp()'s own duplicate-prevention against a race: without this, two
-- concurrent "in" calls for the same person (e.g. a double-click) could each see no existing
-- players row and both insert one. Partial (person_id is not null) so ad-hoc players added
-- via the free-text join flow for other formats -- which never set person_id -- are
-- unaffected. If this fails to apply because duplicate (tournament_id, person_id) rows
-- already exist in production, those must be deduplicated manually first.
create unique index players_tournament_person_unique_idx on public.players (tournament_id, person_id)
  where person_id is not null;

alter table public.league_rsvps enable row level security;

-- Organizers can read RSVPs for their own tournaments.
create policy "league_rsvps_select_own" on public.league_rsvps
  for select using (
    tournament_id in (
      select id from public.tournaments
      where organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
    )
  );

-- The public page needs to read current status for every invitee without being the
-- organizer -- matches tournaments_select_all's existing "select using (true)" openness.
create policy "league_rsvps_select_public" on public.league_rsvps
  for select using (true);

-- Belt-and-braces beyond RLS: Supabase's default privileges grant every new table
-- INSERT/UPDATE/DELETE to anon/authenticated (set at project bootstrap, not visible anywhere
-- in this repo's migrations -- see 20260824190000_tighten_public_signup_policies.sql, which
-- had to revoke the identical default grant on public.people/public.players). Revoking here
-- means set_league_rsvp() (SECURITY DEFINER, below) is provably the only way anon/
-- authenticated can write to this table, not just the only way RLS happens to allow today.
revoke insert, update, delete on public.league_rsvps from anon, authenticated;

create or replace function public.set_league_rsvp(
  p_tournament_id uuid,
  p_person_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament record;
  v_person_exists boolean;
  v_cutoff timestamptz;
  v_existing_player_id uuid;
  v_next_waiting record;
begin
  if p_status is null or p_status not in ('in', 'out', 'tentative') then
    raise exception 'Invalid status';
  end if;

  -- Lock the tournament row for the duration of this transaction so concurrent RSVP calls
  -- for the same tournament serialize instead of racing on the read-then-write below --
  -- otherwise two concurrent "in" calls could both pass the cap check, or two concurrent
  -- "out" calls could both select and promote the same waiting-list person.
  select id, organizer_id, format, date, max_players, completed_at
    into v_tournament
    from public.tournaments
    where id = p_tournament_id
    for update;

  if not found then
    raise exception 'League not found';
  end if;
  if v_tournament.format <> 'league_playoffs' then
    raise exception 'RSVP is only available for League Playoffs';
  end if;
  if v_tournament.completed_at is not null then
    raise exception 'This league has already finished';
  end if;

  v_cutoff := (v_tournament.date::text || ' 17:00:00')::timestamp at time zone 'Asia/Dubai';
  if now() >= v_cutoff then
    raise exception 'RSVP is closed for this league';
  end if;

  select exists(
    select 1 from public.people where id = p_person_id and organizer_id = v_tournament.organizer_id
  ) into v_person_exists;
  if not v_person_exists then
    raise exception 'Person not found';
  end if;

  insert into public.league_rsvps (tournament_id, person_id, status, responded_at)
  values (p_tournament_id, p_person_id, p_status, now())
  on conflict (tournament_id, person_id)
  do update set
    status = excluded.status,
    responded_at = case
      when league_rsvps.status is distinct from excluded.status then excluded.responded_at
      else league_rsvps.responded_at
    end;

  select id into v_existing_player_id from public.players
    where tournament_id = p_tournament_id and person_id = p_person_id;

  if p_status = 'in' then
    if v_existing_player_id is null
       and (v_tournament.max_players is null
            or (select count(*) from public.players where tournament_id = p_tournament_id) < v_tournament.max_players)
    then
      insert into public.players (tournament_id, name, person_id)
      select p_tournament_id, name, id from public.people where id = p_person_id;
    end if;
    -- If there's no room, the RSVP row above is still 'in' with no players row -- that
    -- absence of a players row IS the waiting-list membership.
  else
    if v_existing_player_id is not null then
      delete from public.players where id = v_existing_player_id;

      select r.person_id, pe.name into v_next_waiting
        from public.league_rsvps r
        join public.people pe on pe.id = r.person_id
        where r.tournament_id = p_tournament_id
          and r.status = 'in'
          and not exists (
            select 1 from public.players pl
            where pl.tournament_id = p_tournament_id and pl.person_id = r.person_id
          )
        order by r.responded_at asc
        limit 1;

      if v_next_waiting.person_id is not null then
        insert into public.players (tournament_id, name, person_id)
        values (p_tournament_id, v_next_waiting.name, v_next_waiting.person_id);
      end if;
    end if;
  end if;
end;
$$;

revoke execute on function public.set_league_rsvp(uuid, uuid, text) from public;
grant execute on function public.set_league_rsvp(uuid, uuid, text) to anon, authenticated;
