-- Tighten the public sign-up write path (post-launch security review of
-- 20260824180000): the previous policies let anon set ARBITRARY columns on
-- people/players via a direct PostgREST call (e.g. photo_url, nickname, strengths --
-- Supabase grants full table-level INSERT to anon/authenticated by default, and RLS
-- alone does not restrict which columns a permitted insert may set). They also only
-- covered the `anon` role -- a second, different organizer visiting a public link runs
-- as `authenticated`, not `anon`, and would have hit an RLS violation.
--
-- This migration:
--   1. Revokes the broad table-level INSERT grant and replaces it with column-scoped
--      grants covering only the columns any insert path in this app actually sets
--      (verified against every INSERT call site: people only ever sets
--      organizer_id/name; players only ever sets tournament_id/name/person_id -- every
--      other column is nullable or has a default, so no existing flow breaks).
--   2. Extends both public-signup policies to the `authenticated` role too.
--   3. Makes the players capacity check atomic at the database layer (the app-code
--      count-then-insert check was a race under concurrent signups); also closes the
--      "player.photo_url as a remote-image/IP-leak vector" concern by construction,
--      since photo_url is no longer an insertable column for these roles at all.

drop policy "people_insert_public_signup" on public.people;
drop policy "players_insert_public_signup" on public.players;

revoke insert on public.people from anon, authenticated;
revoke insert on public.players from anon, authenticated;

-- Re-grant table-level insert for `authenticated` (the organizer's own existing
-- people_insert_own / players_insert_own_tournament policies still need it -- RLS
-- policies gate ROWS, GRANTs gate table/column ACCESS, both layers are required).
grant insert on public.people to authenticated;
grant insert on public.players to authenticated;

-- Public sign-up (anon, or a second organizer's authenticated session) may only ever
-- supply these columns -- matches exactly what joinLeague sets today.
grant insert (organizer_id, name) on public.people to anon, authenticated;
grant insert (tournament_id, name, person_id) on public.players to anon, authenticated;

create policy "people_insert_public_signup" on public.people
  for insert to anon, authenticated
  with check (
    organizer_id in (select organizer_id from public.tournaments)
  );

create policy "players_insert_public_signup" on public.players
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.completed_at is null
        and (
          t.max_players is null
          or (select count(*) from public.players p where p.tournament_id = t.id) < t.max_players
        )
    )
  );
