-- Public (anonymous) league sign-up: two new permissive INSERT policies, additive to
-- the existing organizer-scoped ones (people_insert_own, players_insert_own_tournament).
-- Postgres OR's multiple permissive policies together, so authenticated organizer
-- writes are unaffected -- these only add a new allowed path for the anon role.
--
-- Intentionally permissive at the RLS layer (any anon request can insert a people row
-- for any organizer, or a players row for any non-completed tournament) rather than
-- tightly scoped to "the one tournament the signup was for" -- Postgres RLS can't see
-- sibling values across a multi-row transaction, and a public sign-up form was always
-- going to allow anonymous writes. The app code (joinLeague) is what actually scopes
-- each insert correctly by reading the target tournament first.

create policy "people_insert_public_signup" on public.people
  for insert to anon
  with check (
    organizer_id in (select organizer_id from public.tournaments)
  );

create policy "players_insert_public_signup" on public.players
  for insert to anon
  with check (
    tournament_id in (select id from public.tournaments where completed_at is null)
  );
