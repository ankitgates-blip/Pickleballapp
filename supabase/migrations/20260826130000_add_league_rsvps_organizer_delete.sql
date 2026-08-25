-- Lets an organizer directly clear a person's RSVP row for their own tournament. This is
-- a narrow, RLS-gated, authenticated-only path -- distinct from the public/anonymous
-- write surface, which remains exclusively through set_league_rsvp() (see
-- 20260825150000_add_league_rsvps.sql). Needed so removePlayer (roster/actions.ts) can
-- reset league_rsvps when an organizer manually removes a player, preventing that player
-- from silently re-appearing as the earliest-queued waiting-list member (their
-- responded_at predates everyone who joined normally) on the next promotion.
--
-- Mirrors the existing league_rsvps_select_own policy's organizer-ownership subquery.
-- Grant is to authenticated only -- anon gets no table-level grant on this table, exactly
-- as before this migration.
create policy "league_rsvps_delete_own" on public.league_rsvps
  for delete using (
    tournament_id in (
      select id from public.tournaments
      where organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
    )
  );

grant delete on public.league_rsvps to authenticated;
