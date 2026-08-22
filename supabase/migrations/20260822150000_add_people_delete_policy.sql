create policy "people_delete_own" on public.people
  for delete using (
    organizer_id in (select id from public.organizers where auth_user_id = auth.uid())
  );
