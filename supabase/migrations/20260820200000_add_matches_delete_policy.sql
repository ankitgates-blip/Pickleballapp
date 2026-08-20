create policy "matches_delete_own_tournament" on public.matches
  for delete using (public.is_tournament_owner(tournament_id));
