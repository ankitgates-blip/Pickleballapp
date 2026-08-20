alter table public.people add column photo_url text;

insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do nothing;

create policy "player_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'player-photos'
    and (storage.foldername(name))[1] = (
      select id::text from public.organizers where auth_user_id = auth.uid()
    )
  );

create policy "player_photos_update_own" on storage.objects
  for update using (
    bucket_id = 'player-photos'
    and (storage.foldername(name))[1] = (
      select id::text from public.organizers where auth_user_id = auth.uid()
    )
  );

create policy "player_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'player-photos'
    and (storage.foldername(name))[1] = (
      select id::text from public.organizers where auth_user_id = auth.uid()
    )
  );
